import { isBelowPar, parRatio, type ParCheckable } from '@/lib/inventory/par';
import { splitRevenue, type SalesTaxConfig } from '@/lib/books/sales-tax';
import type { SyncHealth } from '@/lib/pos/sync-health';
import { tipsPerHour } from '@/lib/pos/tip-rate';
import { periodDelta } from '@/lib/pos/deltas';
import type { NotificationDraft } from './types';

// ── Low stock ────────────────────────────────────────────────────────────────

export type StockItem = ParCheckable & { id: string; name: string };

/** What the previous low-stock digest reported, read back from its payload. */
export type LowStockHistory = { itemIds: readonly string[] };

/**
 * A nightly digest of items that have dropped below par, edge-triggered.
 *
 * Two things make this bearable rather than infuriating:
 *
 *  1. It is ONE notification listing many items, not one per bottle. A bar
 *     doing a full count can put thirty items below par in a single evening.
 *  2. It fires on the CROSSING, not on the state. An item that has been below
 *     par for a week is already known about — re-announcing it nightly is how
 *     an alert channel gets muted and then ignored, taking the useful alerts
 *     with it.
 *
 * `previous` is the last digest's payload. Absent (first ever run) every
 * currently-low item counts as newly crossed, which is correct: nobody has been
 * told about any of them yet.
 */
export function detectLowStock(
  items: readonly StockItem[],
  previous: LowStockHistory | null,
  businessDate: string,
): NotificationDraft | null {
  const low = items.filter(isBelowPar);
  if (low.length === 0) return null;

  const alreadyReported = new Set(previous?.itemIds ?? []);
  const newlyLow = low.filter((i) => !alreadyReported.has(i.id));
  if (newlyLow.length === 0) return null;

  // Worst first — an item at 10% of par needs ordering before one at 90%.
  const ranked = [...newlyLow].sort((a, b) => parRatio(a) - parRatio(b));
  const named  = ranked.slice(0, 3).map((i) => i.name);
  const rest   = ranked.length - named.length;

  const title = newlyLow.length === 1
    ? `${named[0]} is below par`
    : `${newlyLow.length} items dropped below par`;

  const body = rest > 0
    ? `${named.join(', ')} and ${rest} more. ${low.length} items are below par in total.`
    : `${named.join(', ')}. ${low.length} items are below par in total.`;

  return {
    eventType: 'inventory.low_stock',
    title,
    body,
    link:      '/app/inventory',
    // Every currently-low id, not just the new ones — this payload is what the
    // NEXT run reads as `previous`, so it has to describe the full known state.
    payload:   { itemIds: low.map((i) => i.id), newItemIds: newlyLow.map((i) => i.id) },
    dedupeKey: `inventory.low_stock:${businessDate}`,
  };
}

// ── Nightly sales ────────────────────────────────────────────────────────────

export type ZDay = {
  report_date: string;
  total_sales: number | null;
  /**
   * NULL means the POS did not report the split — older agents, emailed Z
   * reports and pre-1.1.0 configs all send nothing. It does NOT mean the night
   * took no cash, and a notification claiming $0.00 cash would be a lie the
   * rest of the app is careful not to tell.
   */
  cash_sales:  number | null;
  card_sales:  number | null;
};

/**
 * Whole dollars, except when that would round a real figure away to nothing.
 *
 * A $0.40 card total rendered as "$0 card" reads as "the night took no card",
 * which is the same lie as rendering a NULL split as zero — the thing the rest
 * of this file is careful not to do. Below a dollar, cents are shown.
 */
function money(n: number): string {
  const roundsToNothing = n !== 0 && Math.abs(n) < 0.5;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: roundsToNothing ? 2 : 0,
    maximumFractionDigits: roundsToNothing ? 2 : 0,
  });
}

export function detectZReportClosed(day: ZDay): NotificationDraft | null {
  if (day.total_sales === null) return null;

  const parts = [`${money(day.total_sales)} in sales`];
  // Only speak to the split when the POS actually reported one.
  if (day.cash_sales !== null && day.card_sales !== null) {
    parts.push(`${money(day.cash_sales)} cash, ${money(day.card_sales)} card`);
  }

  return {
    eventType: 'sales.z_report_closed',
    title:     `Last night: ${money(day.total_sales)}`,
    body:      parts.join(' — '),
    link:      '/app/sales',
    payload:   { reportDate: day.report_date, totalSales: day.total_sales },
    dedupeKey: `sales.z_report_closed:${day.report_date}`,
  };
}

// ── Sales anomaly ────────────────────────────────────────────────────────────

/** Deviation from the trailing mean at which a night is worth mentioning. */
export const ANOMALY_THRESHOLD = 0.25;

/**
 * Below this many prior same-weekday nights the mean is not a baseline, it is
 * an accident. A new bar should hear nothing rather than be told its second
 * Tuesday ever was "unusual".
 */
export const MIN_SAMPLES = 3;

/**
 * Compare a night against the same weekday over the preceding weeks.
 *
 * Same-weekday is the whole point. A bar's Saturday is a multiple of its
 * Tuesday, so measuring against an all-days average would flag every weekend as
 * a spike and every Monday as a collapse, forever.
 *
 * `history` is prior days only, most recent first; the caller supplies the
 * window (four same-weekday nights).
 */
export function detectSalesAnomaly(
  day: ZDay,
  history: readonly ZDay[],
): NotificationDraft | null {
  if (day.total_sales === null) return null;

  const samples = history
    .filter((d) => d.report_date !== day.report_date && d.total_sales !== null)
    .map((d) => d.total_sales as number);

  if (samples.length < MIN_SAMPLES) return null;

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  // A zero baseline makes the ratio meaningless rather than infinite.
  if (mean <= 0) return null;

  const delta = (day.total_sales - mean) / mean;
  if (Math.abs(delta) < ANOMALY_THRESHOLD) return null;

  const pct  = Math.round(Math.abs(delta) * 100);
  const up   = delta > 0;
  const dow  = new Date(`${day.report_date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });

  return {
    eventType: 'sales.anomaly',
    title:     up ? `Sales up ${pct}%` : `Sales down ${pct}%`,
    body:      `${money(day.total_sales)} against a ${dow} average of ${money(mean)} over the last ${samples.length} weeks.`,
    link:      '/app/sales',
    payload:   { reportDate: day.report_date, totalSales: day.total_sales, mean, delta },
    dedupeKey: `sales.anomaly:${day.report_date}`,
  };
}

// ── Sales tax held ───────────────────────────────────────────────────────────

/**
 * How much of last night's take belongs to the state.
 *
 * Sales tax is a liability the bar collects and remits, never its money — the
 * point of saying it out loud the morning after is that the figure is still in
 * the drawer, and an owner who has already spent it finds out at filing time.
 *
 * Silent unless the split is a real calculation. `splitRevenue` refuses to
 * guess at an unset rate or an unknown tax treatment of POS prices, and an
 * alert is the worst possible place to start guessing: it names a dollar amount
 * an operator will act on, out of context, on a phone. Nothing is better than
 * a confident wrong number.
 */
export function detectSalesTax(
  day: ZDay,
  config: SalesTaxConfig,
): NotificationDraft | null {
  if (day.total_sales === null) return null;

  const split = splitRevenue(day.total_sales, config);
  // Not configured, or a night that took nothing — neither has tax to remit.
  if (!split.configured || split.tax === null || split.tax <= 0) return null;

  return {
    eventType: 'sales.tax_daily',
    title:     `Set aside ${money(split.tax)} in sales tax`,
    body:      `From ${money(split.gross ?? day.total_sales)} taken last night — ${money(split.net)} of it is yours.`,
    link:      '/app/books',
    payload:   { reportDate: day.report_date, tax: split.tax, net: split.net, gross: split.gross },
    dedupeKey: `sales.tax_daily:${day.report_date}`,
  };
}

// ── Tips per hour ────────────────────────────────────────────────────────────

export type TipNight = {
  report_date: string;
  /** Both nullable in practice: the column defaults to 0, older rows may not. */
  cash_tips: number | null;
  cc_tips:   number | null;
  /** Total hours recorded across every shift on that night. */
  hoursWorked: number;
};

/**
 * What the night was worth to whoever worked it, per hour on the floor.
 *
 * Bar-wide, not per person. A rate is the figure that survives comparison
 * between a four-hour Tuesday and a ten-hour Saturday, which a tip total never
 * does — and it is the number an operator is actually holding in their head
 * when they decide whether Tuesdays are worth staffing.
 *
 * Deliberately NOT a per-employee alert. Broadcasting one bartender's rate
 * against another's is a different product decision entirely, and a worse one.
 */
export function detectHourlyTips(night: TipNight): NotificationDraft | null {
  // The rate itself is lib/pos/tip-rate.ts, shared with the Sales screen so the
  // two can never quote different figures for the same night. Null from it
  // means the rate cannot honestly be stated — no hours, or no tips recorded —
  // and an alert is exactly the wrong place to state one anyway.
  const rate = tipsPerHour(night.cash_tips, night.cc_tips, night.hoursWorked);
  if (rate === null) return null;

  const tips = (night.cash_tips ?? 0) + (night.cc_tips ?? 0);

  return {
    eventType: 'tips.hourly',
    title:     `${money(rate)}/hr in tips last night`,
    body:      `${money(tips)} across ${night.hoursWorked.toLocaleString()} recorded hours.`,
    link:      '/app/tips',
    payload:   { reportDate: night.report_date, tips, hours: night.hoursWorked, rate },
    dedupeKey: `tips.hourly:${night.report_date}`,
  };
}

// ── POS feed went quiet ──────────────────────────────────────────────────────

/** A POS box switched off overnight is ordinary; a full day of silence is not. */
export const FEED_QUIET_AFTER_MINUTES = 24 * 60;

const API_NAMES: Record<string, string> = { clover: 'Clover', toast: 'Toast' };

/**
 * Tell the owner the POS stopped sending, once per episode.
 *
 * Reads assessSyncHealth's output, so it shares that function's judgement:
 * `no-data` (amber, maybe a closed bar), `errors` (a different message),
 * `healthy` and `not-configured` never fire, and an absent last_sync_summary
 * is "cannot say" upstream so it cannot fire here either. Only silence of a
 * day or more, or a login the POS no longer accepts, does.
 *
 * The dedupe key is the day of the last sync that worked: it is the same for
 * every nightly pass while the bar stays silent, and different once the feed
 * recovers and later stalls again. A re-login that fails again the same day
 * shares a key and is not re-announced; that is the cost of one key per episode.
 */
export function detectFeedStale(health: SyncHealth, provider: string | null | undefined): NotificationDraft | null {
  const { status, minutesAgo, lastSyncAt } = health;
  const reauth = status === 'needs-reauth';
  const silent = status === 'stale' || status === 'down';
  if (!reauth && !(silent && (minutesAgo === null || minutesAgo >= FEED_QUIET_AFTER_MINUTES))) return null;

  const lastDay = lastSyncAt ? lastSyncAt.slice(0, 10) : null;
  const when = lastDay
    ? new Date(`${lastDay}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    : null;
  const api = provider ? API_NAMES[provider] : undefined;

  const action = api
    ? `Reconnect ${api} in Settings, POS Integration. If the bar was closed, nothing is wrong.`
    : 'Check that the POS computer is on and the Rail program is running. If the bar was closed, nothing is wrong.';

  return {
    eventType: 'pos.feed_stale',
    title:     reauth && api ? `${api} needs reconnecting` : when ? `No sales since ${when}` : 'No sales received yet',
    body:      `${when ? `The last data arrived ${when}. ` : 'The POS has not sent anything yet. '}${action}`,
    link:      '/app/settings?tab=pos',
    payload:   { lastSyncAt, status },
    dedupeKey: `pos.feed_stale:${lastDay ?? 'never'}`,
  };
}

// ── Weekly owner summary ─────────────────────────────────────────────────────

export type WeekWindow = { start: string; end: string; priorStart: string; priorEnd: string };

const shiftISO = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The Monday-to-Sunday week ending on `sundayISO`, plus the week before it. Null for any other day. */
export function weekEndingOn(sundayISO: string): WeekWindow | null {
  if (new Date(`${sundayISO}T00:00:00Z`).getUTCDay() !== 0) return null;
  return {
    start: shiftISO(sundayISO, -6), end: sundayISO,
    priorStart: shiftISO(sundayISO, -13), priorEnd: shiftISO(sundayISO, -7),
  };
}

export type WeeklyDay = {
  report_date: string;
  total_sales: number | null;
  cash_tips: number | null;
  cc_tips: number | null;
};

export type WeeklyInput = {
  week: WeekWindow;
  /** Z days for both weeks. */
  days: readonly WeeklyDay[];
  /** Bar-wide hours for the week. Never per person. */
  hoursThisWeek: number;
  items: readonly StockItem[];
  pendingPayrollRuns: number;
  /** Title of the pos.feed_stale alert when the feed is stale, else null. */
  feedNote: string | null;
};

export type WeeklySummary = {
  weekStart: string;
  weekLabel: string;
  salesText: string;
  nightsReported: number;
  change: { text: string; tone: 'up' | 'down' | 'flat' | 'unknown' };
  tipsPerHour: string | null;
  hoursText: string | null;
  lowStock: number;
  pendingApprovals: number;
  feedNote: string | null;
};

const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** One plain sentence per figure; the same lines feed the inbox body and the email. */
export function weeklyLines(s: WeeklySummary): string[] {
  const lines: string[] = [];
  if (s.feedNote) lines.push(s.feedNote);
  lines.push(`Sales ${s.salesText} over ${s.nightsReported} ${s.nightsReported === 1 ? 'night' : 'nights'}. ${s.change.text}.`);
  if (s.tipsPerHour) lines.push(`Tips ${s.tipsPerHour}.`);
  if (s.hoursText) lines.push(`${s.hoursText} worked.`);
  lines.push(s.lowStock === 0 ? 'Nothing is below par.' : `${s.lowStock} ${s.lowStock === 1 ? 'item is' : 'items are'} below par.`);
  if (s.pendingApprovals > 0) lines.push('A pay run is waiting for approval.');
  return lines;
}

export function detectWeeklySummary(input: WeeklyInput): { draft: NotificationDraft; summary: WeeklySummary } | null {
  const { week } = input;
  const inWeek = (d: WeeklyDay, a: string, b: string) => d.report_date >= a && d.report_date <= b && d.total_sales !== null;
  const cur = input.days.filter((d) => inWeek(d, week.start, week.end));
  const prev = input.days.filter((d) => inWeek(d, week.priorStart, week.priorEnd));
  if (cur.length === 0 && prev.length === 0) return null;

  const sum = (ds: readonly WeeklyDay[], k: 'total_sales' | 'cash_tips' | 'cc_tips') =>
    ds.reduce((t, d) => t + (Number(d[k]) > 0 ? Number(d[k]) : 0), 0);
  const total = sum(cur, 'total_sales');

  // Same weekdays reported in both weeks. A bar shut on Mondays still compares;
  // a missing Sunday does not, because it would read as a collapse.
  const weekdays = (ds: readonly WeeklyDay[]) =>
    [...new Set(ds.map((d) => new Date(`${d.report_date}T00:00:00Z`).getUTCDay()))].sort().join();
  const comparable = cur.length > 0 && cur.length === prev.length && weekdays(cur) === weekdays(prev);
  const delta = periodDelta({ current: total, prior: sum(prev, 'total_sales'), comparable });

  let change: WeeklySummary['change'];
  if (delta.kind === 'incomplete') {
    change = { text: 'Not compared with the week before, because a night is missing from one of the weeks', tone: 'unknown' };
  } else {
    const dir = delta.amount > 0 ? 'Up' : delta.amount < 0 ? 'Down' : null;
    const size = delta.percent !== null ? `${Math.abs(delta.percent)}%` : money(Math.abs(delta.amount));
    change = !dir || size === '0%'
      ? { text: 'Flat on the week before', tone: 'flat' }
      : { text: `${dir} ${size} on the week before`, tone: dir === 'Up' ? 'up' : 'down' };
  }

  const tph = tipsPerHour(sum(cur, 'cash_tips'), sum(cur, 'cc_tips'), input.hoursThisWeek);
  const lowStock = input.items.filter(isBelowPar).length;
  const hours = input.hoursThisWeek > 0 ? Math.round(input.hoursThisWeek * 10) / 10 : 0;

  const summary: WeeklySummary = {
    weekStart: week.start,
    weekLabel: `${longDay(week.start)} to ${longDay(week.end)}`,
    salesText: cur.length ? money(total) : 'not reported',
    nightsReported: cur.length,
    change,
    tipsPerHour: tph === null ? null : `${tph.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} an hour`,
    hoursText: hours > 0 ? `${hours} labor hours` : null,
    lowStock,
    pendingApprovals: input.pendingPayrollRuns,
    feedNote: input.feedNote,
  };

  return {
    summary,
    draft: {
      eventType: 'weekly.summary',
      title:     cur.length ? `Last week: ${money(total)}` : 'Last week: no sales reported',
      body:      weeklyLines(summary).join(' '),
      link:      '/app/dashboard',
      payload: {
        weekStart: week.start, totalSales: total, nightsReported: cur.length,
        priorWeekComparable: comparable, hoursWorked: input.hoursThisWeek,
        lowStock, pendingApprovals: input.pendingPayrollRuns,
      },
      dedupeKey: `weekly.summary:${week.start}`,
    },
  };
}
