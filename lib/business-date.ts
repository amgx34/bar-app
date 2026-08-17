/**
 * Business-day boundaries for bars.
 *
 * A bar's trading session routinely crosses midnight — open 5pm, close 3am —
 * so the calendar date is the wrong unit for every figure an operator cares
 * about. Sales rung at 01:40 on Sunday belong to *Saturday's* night.
 *
 * The rule: a timestamp before the cutoff hour belongs to the previous
 * calendar day. Default cutoff is 04:00, which sits after typical last call
 * and before any bar opens, so no real session straddles it.
 *
 * All functions here work on **local wall-clock parts** — the hour as it
 * appeared on the clock behind the bar. Z reports print local time, and POS
 * exports are local, so no timezone conversion is applied or wanted. Callers
 * holding a UTC instant must convert to the venue's local time first.
 */

export const DEFAULT_BUSINESS_DAY_CUTOFF_HOUR = 4;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/**
 * Resolves local wall-clock parts to the business date they belong to.
 *
 * @param year   full year, e.g. 2026
 * @param month  1-12 (not the JS 0-11 convention)
 * @param day    1-31
 * @param hour   0-23 local wall-clock hour
 * @param cutoffHour hour before which a timestamp rolls back a day
 * @returns YYYY-MM-DD
 */
export function businessDateFromParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  cutoffHour: number = DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
): string {
  // Construct at noon so the -1 day step can never trip over a DST boundary.
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (hour < cutoffHour) {
    d.setDate(d.getDate() - 1);
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Same rule, applied to an already-formatted local date plus an optional local
 * time. When the time is unknown the date is returned untouched — guessing
 * would silently move figures onto a day the operator never traded.
 *
 * @param date YYYY-MM-DD as printed by the POS (local)
 * @param time HH:MM or HH:MM:SS, 24-hour, local. Optional.
 */
export function businessDateFromLocal(
  date: string,
  time: string | null | undefined,
  cutoffHour: number = DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!dateMatch) return date;
  if (!time) return date;

  const timeMatch = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!timeMatch) return date;

  const [, y, m, d] = dateMatch;
  const hour = Number(timeMatch[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return date;

  return businessDateFromParts(Number(y), Number(m), Number(d), hour, cutoffHour);
}

/**
 * Reads the cutoff from an organisation's `bar_settings` JSONB, falling back to
 * the default when unset or out of range.
 */
export function cutoffHourFromSettings(
  barSettings: Record<string, unknown> | null | undefined,
): number {
  const raw = barSettings?.business_day_cutoff_hour;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 12) {
    return DEFAULT_BUSINESS_DAY_CUTOFF_HOUR;
  }
  return n;
}
