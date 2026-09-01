import { isBelowPar, parRatio, type ParCheckable } from '@/lib/inventory/par';
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
