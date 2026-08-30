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
  return payPeriodFromParams(rawStart, rawEnd) ?? fallback;
}

/**
 * The pay period a query string actually names, or null when it names none.
 *
 * The null is what separates "show me this week" from "show me the default
 * week": a link that carries no dates must let the page choose, while a link
 * carrying junk must not quietly become a different period. resolvePayPeriod
 * turns that null into a fallback; payRunHref leaves it off the URL entirely.
 */
export function payPeriodFromParams(
  rawStart: unknown,
  rawEnd: unknown,
): { start: string; end: string } | null {
  const start = isIsoDate(rawStart) ? rawStart : null;
  const end = isIsoDate(rawEnd) ? rawEnd : null;

  // Both or neither. Honouring one half of a broken range would silently show
  // a period nobody asked for — a week starting where they said and ending
  // somewhere else entirely.
  if (!start || !end) return null;

  // Accept a reversed range rather than rejecting it; the intent is obvious.
  return start <= end ? { start, end } : { start: end, end: start };
}

/**
 * A link to a Payroll screen that keeps the week you are looking at.
 *
 * "Run Payroll" used to be a bare path, so the review screen fell back to the
 * current week and a bar could browse a previous week but never run one. The
 * link is rendered from a shared layout that sits above tabs with no week on
 * screen at all, hence the bare-path case: no period to carry is a real answer,
 * and the destination defaulting to this week is correct there.
 */
export function payRunHref(path: string, rawStart: unknown, rawEnd: unknown): string {
  const period = payPeriodFromParams(rawStart, rawEnd);
  if (!period) return path;
  return `${path}?startDate=${period.start}&endDate=${period.end}`;
}

// ── Payroll period views ──────────────────────────────────────────────────────

/**
 * Which period the Payroll screen is showing.
 *
 * Day is the default because the operator's daily job is splitting one night's
 * tips; the week and month are what they look at on pay day, which is once.
 */
export type PayrollView = 'day' | 'week' | 'month';

const PAYROLL_VIEWS: PayrollView[] = ['day', 'week', 'month'];

/**
 * The view a query string names, defaulting to the day.
 *
 * Anything unrecognised falls back rather than erroring — `?view=` comes off a
 * URL, where a typo or a stale bookmark is ordinary, and the day view is a
 * correct answer to "which period" when the URL cannot say.
 */
export function resolvePayrollView(raw: unknown): PayrollView {
  return PAYROLL_VIEWS.includes(raw as PayrollView) ? (raw as PayrollView) : 'day';
}

/**
 * The calendar month containing `iso`, inclusive at both ends.
 *
 * A calendar month, not a rolling 30 days: payroll is reconciled against months
 * that have names, and "August" has to mean the 1st to the 31st or it does not
 * tie out against anything the bar's accountant has.
 *
 * UTC throughout, for the reason at the top of this file — `report_date` is
 * already the bar's own idea of the night, and local-time arithmetic here would
 * put the 1st of the month in the previous one for half the world.
 */
export function monthRange(iso: string): { start: string; end: string } {
  const [y, m] = iso.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  // Day 0 of the NEXT month is the last day of this one, which is what makes
  // February and the leap year fall out for free rather than needing a table.
  const end = new Date(Date.UTC(y, m, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/**
 * The default period for a view, given today.
 *
 * The week is Monday–Sunday and matches `defaultWeek()` in the payroll route's
 * `_shared.ts`; Sunday belongs to the week that preceded it, because a bar's
 * Sunday trade is the tail of the week just worked, not the head of the next.
 */
export function defaultPeriod(view: PayrollView, today: string): { start: string; end: string } {
  if (view === 'month') return monthRange(today);

  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const start = addDays(today, -(day === 0 ? 6 : day - 1));
  // The day view still carries a period so that Run Payroll, and a switch to
  // the week, land on the week the night being split belongs to.
  return { start, end: addDays(start, 6) };
}

/**
 * The next or previous period of the same kind.
 *
 * Stepping a month by adding days is what puts you in the wrong month on the
 * 31st, so the month case rebuilds the range from the month number instead.
 * The day view steps a single night, which is what its arrows have always done.
 */
export function shiftPeriod(
  view: PayrollView,
  start: string,
  end: string,
  dir: 'prev' | 'next',
): { start: string; end: string } {
  const delta = dir === 'prev' ? -1 : 1;

  if (view === 'month') {
    const [y, m] = start.split('-').map(Number);
    // Anchored on the 1st: month arithmetic from the 31st would skip February
    // entirely, since there is no 31st to land on.
    const anchor = new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
    return monthRange(anchor);
  }

  const step = view === 'day' ? delta : delta * 7;
  return { start: addDays(start, step), end: addDays(end, step) };
}
