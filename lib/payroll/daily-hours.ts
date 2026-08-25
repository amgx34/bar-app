/**
 * The nights behind a week's total hours.
 *
 * Pure — no database, no clock.
 *
 * WHY THIS EXISTS
 *
 * Payroll is computed per night, and the Adjust dialog has always written one
 * night at a time. But it is opened from a row showing the WHOLE period's
 * total, and its date defaults to the first day of that period. So an operator
 * looking at "38.50 hrs" for the week, typing what the week ought to be, wrote
 * that figure onto the Monday alone and left the other six nights untouched —
 * and the week came out as the number they typed plus the rest of the week.
 *
 * Nothing was miscalculating. The screen simply never showed the nights, so
 * there was no way to see which one was wrong. This builds that list.
 */

/** Where a night's figure came from. Mirrors `employee_shifts.hours_source`. */
export type HoursSource = 'pos' | 'manual';

export type DailyHoursRow = {
  /** YYYY-MM-DD. */
  date: string;
  /** Mon, Tue, … Reading a date alone tells nobody which night it was. */
  weekday: string;
  /** Hours worked that night: the stored regular and overtime added together. */
  hours: number;
  /**
   * Whether a shift row exists at all.
   *
   * Deliberately separate from `hours === 0`. A missing row is somebody who
   * forgot to clock in — precisely the case a correction exists for — while a
   * stored zero is a night someone decided they worked none. Collapsing the two
   * hides the only one worth looking at.
   */
  hasShift: boolean;
  /** Null when no shift was recorded, so "unknown" cannot read as "from the POS". */
  source: HoursSource | null;
  isOpener: boolean;
};

/** A row as it comes off `employee_shifts`. Fields are loose — this is DB data. */
export type ShiftRowInput = {
  shift_date: string;
  regular_hours?: number | string | null;
  overtime_hours?: number | string | null;
  hours_source?: string | null;
  is_opener?: boolean | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * A year. The bounds come off a query string, and a transposed pair should
 * produce an empty screen rather than a loop nobody can stop.
 */
const MAX_DAYS = 366;

function isIso(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Reads a stored hours figure. Anything unreadable is no hours, never NaN. */
function hours(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Every night in the period, whether or not a shift was recorded for it.
 *
 * Done in UTC throughout: `shift_date` is a DATE, the bar's own idea of which
 * night a shift belonged to, already settled upstream. Walking the range in
 * local time would let a clock change drop or duplicate a night.
 */
export function buildDailyHours(
  shifts: ShiftRowInput[],
  startDate: string,
  endDate: string,
): DailyHoursRow[] {
  if (!isIso(startDate) || !isIso(endDate) || endDate < startDate) return [];

  // Fold the shifts by date first, so a night with two rows is added up rather
  // than half-reported. The table is unique on (org, employee, date) so this
  // should not happen — but showing one of two rows understates somebody's pay,
  // which is not a failure worth risking on an assumption.
  const byDate = new Map<string, { hours: number; source: HoursSource; isOpener: boolean }>();

  for (const shift of shifts ?? []) {
    const date = shift?.shift_date;
    if (!isIso(date)) continue;

    const worked = hours(shift?.regular_hours) + hours(shift?.overtime_hours);
    // Anything that is not literally 'manual' is the POS, matching the column's
    // own default — the same direction lib/payroll/tip-pool.ts reads pay_type.
    const source: HoursSource = shift?.hours_source === 'manual' ? 'manual' : 'pos';

    const existing = byDate.get(date);
    byDate.set(date, {
      hours: (existing?.hours ?? 0) + worked,
      // A hand correction wins: it is the flag that claims the night from the
      // agent's next sync, and losing it here would misreport who owns the figure.
      source: existing?.source === 'manual' || source === 'manual' ? 'manual' : 'pos',
      isOpener: Boolean(existing?.isOpener) || Boolean(shift?.is_opener),
    });
  }

  const rows: DailyHoursRow[] = [];
  const [y, m, d] = startDate.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));

  for (let i = 0; i < MAX_DAYS; i++) {
    const date = cursor.toISOString().slice(0, 10);
    if (date > endDate) break;

    const found = byDate.get(date);
    rows.push({
      date,
      weekday: WEEKDAYS[cursor.getUTCDay()],
      hours: found?.hours ?? 0,
      hasShift: found !== undefined,
      source: found?.source ?? null,
      isOpener: found?.isOpener ?? false,
    });

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return rows;
}
