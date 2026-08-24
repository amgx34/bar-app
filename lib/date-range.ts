/**
 * Named date ranges for the reporting screens.
 *
 * Pure — takes "today" as an argument rather than reading the clock, so a range
 * can be tested and so a server render and a client render of the same page
 * cannot land on different days.
 *
 * Everything here is plain `YYYY-MM-DD` strings. The POS reports a DATE, not a
 * timestamp, and `z_report_days.report_date` is already the bar's own idea of
 * which night a sale belonged to — a bar open until 4am has already had that
 * decided upstream. Doing arithmetic in local time here would re-introduce the
 * timezone question that the date column exists to settle.
 */

export type RangeKey = 'today' | 'week' | 'month' | 'custom';

export type DateRange = {
  key: RangeKey;
  /** Inclusive. */
  from: string;
  /** Inclusive. */
  to: string;
  label: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Rejects 2026-02-30 and friends, which would otherwise roll forward silently.
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Adds days to a YYYY-MM-DD, staying in UTC so DST cannot shift the result. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Resolves what the screen should show.
 *
 * `today` is a single day, not "the last 24 hours" — an operator asking for
 * today means tonight's numbers so far, and a rolling window would fold in half
 * of yesterday's service.
 *
 * A malformed or incomplete custom range falls back to the week rather than
 * erroring: these values come from the query string, where anything can appear.
 */
export function resolveDateRange(
  key: string | null | undefined,
  today: string,
  from?: string | null,
  to?: string | null,
): DateRange {
  if (key === 'custom' && isIsoDate(from) && isIsoDate(to)) {
    // Accept the range whichever way round it was given.
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    return { key: 'custom', from: lo, to: hi, label: lo === hi ? lo : `${lo} → ${hi}` };
  }

  switch (key) {
    case 'today':
      return { key: 'today', from: today, to: today, label: 'Today' };
    case 'month':
      return { key: 'month', from: addDays(today, -29), to: today, label: 'Last 30 days' };
    case 'week':
    default:
      return { key: 'week', from: addDays(today, -6), to: today, label: 'Last 7 days' };
  }
}

/** Today as the bar's own date string. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * The pay period to show, from whatever arrived in the query string.
 *
 * These values are user-supplied — a shared link, a bookmark, a hand-edited
 * URL — and they flow straight into a Postgres date comparison. `?startDate=
 * banana` returned a 500 error page rather than a pay run.
 *
 * Anything unparseable falls back to the default week. A bad date in a URL is
 * not worth an error screen: the operator wanted payroll, and the current week
 * is the answer to "which one" when the URL cannot say.
 */
export function resolvePayPeriod(
  rawStart: unknown,
  rawEnd: unknown,
  fallback: { start: string; end: string },
): { start: string; end: string } {
  const start = isIsoDate(rawStart) ? rawStart : null;
  const end = isIsoDate(rawEnd) ? rawEnd : null;

  // Both or neither. Honouring one half of a broken range would silently show
  // a period nobody asked for — a week starting where they said and ending
  // somewhere else entirely.
  if (!start || !end) return fallback;

  // Accept a reversed range rather than rejecting it; the intent is obvious.
  return start <= end ? { start, end } : { start: end, end: start };
}
