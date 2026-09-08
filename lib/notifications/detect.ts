import { isBelowPar, parRatio, type ParCheckable } from '@/lib/inventory/par';
import { splitRevenue, type SalesTaxConfig } from '@/lib/books/sales-tax';
import { tipsPerHour } from '@/lib/pos/tip-rate';
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
