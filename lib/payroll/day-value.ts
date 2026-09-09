/**
 * What a chosen set of days is currently worth to one employee.
 *
 * Pure — no database, no clock.
 *
 * WHAT THIS IS FOR
 *
 * Proposing an advance. It is NOT a statement that those days are settled: an
 * advance is a debit against the whole period, and payday pays the approved
 * total minus everything handed over. See the design doc — settling days at the
 * price they were worth on the day underpays anybody whose later shifts push
 * their week past forty hours.
 *
 * That is also why an estimate here is safe. It only has to be defensible and
 * capped, never right.
 *
 * THE OVERTIME RULE
 *
 * Overtime is a weekly threshold, so no day is inherently overtime. Hours are
 * allocated chronologically within each workweek: base rate until the week
 * reaches forty, premium after. A Wednesday is only premium if Monday and
 * Tuesday already used the week up.
 *
 * The workweek comes from `weekStartOf` in ./overtime.ts rather than a second
 * implementation. Two functions disagreeing about when a week starts would put
 * the premium on different days in the payout dialog and in the pay run.
 */

import { WEEKLY_OVERTIME_THRESHOLD, weekStartOf } from './overtime';

export type DayValue = {
  date: string;
  hours: number;
  /** Hours at base rate, after this workweek's forty have been allocated. */
  regularHours: number;
  overtimeHours: number;
  wage: number;
  tips: number;
  total: number;
};

export type ValueDaysInput = {
  shifts: readonly { date: string; hours: number }[];
  /** Tips attributed to each night, from computePayroll's per-day split. */
  tipsByDate: ReadonlyMap<string, number>;
  hourlyRate: number;
  overtime: { enabled: boolean; multiplier: number };
  selected: readonly string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Reads an hours figure. Junk and negatives are no hours, never NaN. */
function hours(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function valueDays(input: ValueDaysInput): { days: DayValue[]; total: number } {
  const rate = Number.isFinite(input.hourlyRate) ? input.hourlyRate : 0;
  const multiplier = input.overtime.enabled ? input.overtime.multiplier : 1;
  const threshold = WEEKLY_OVERTIME_THRESHOLD;

  // Fold to one entry per date first: two rows for one night must be one night,
  // or the threshold walk below counts the same hours twice.
  const hoursByDate = new Map<string, number>();
  for (const shift of input.shifts ?? []) {
    const h = hours(shift?.hours);
    if (h <= 0) continue;
    hoursByDate.set(shift.date, (hoursByDate.get(shift.date) ?? 0) + h);
  }

  // Walk every recorded night in order — not just the ticked ones. Which hours
  // are premium depends on what came earlier in that week, so a selection
  // cannot be priced in isolation.
  const split = new Map<string, { regularHours: number; overtimeHours: number }>();
  const usedByWeek = new Map<string, number>();

  for (const date of [...hoursByDate.keys()].sort()) {
    const h = hoursByDate.get(date) as number;
    const week = weekStartOf(date);

    // A date that cannot be read gets no premium rather than a premium on a
    // week nobody can identify — the same choice splitWeeklyOvertime makes.
    if (week === null) {
      split.set(date, { regularHours: h, overtimeHours: 0 });
      continue;
    }

    const used = usedByWeek.get(week) ?? 0;
    const regularHours = Math.max(0, Math.min(h, threshold - used));
    split.set(date, { regularHours, overtimeHours: h - regularHours });
    usedByWeek.set(week, used + h);
  }

  const days: DayValue[] = [];
  let total = 0;

  for (const date of [...new Set(input.selected)].sort()) {
    const s = split.get(date) ?? { regularHours: 0, overtimeHours: 0 };
    // A ticked night nobody worked is worth nothing and is SHOWN as nothing,
    // rather than dropped — the owner should see what they ticked.
    const wage = round2(s.regularHours * rate + s.overtimeHours * rate * multiplier);
    const tips = round2(Number(input.tipsByDate.get(date)) || 0);
    const dayTotal = round2(wage + tips);

    days.push({
      date,
      hours: round2(s.regularHours + s.overtimeHours),
      regularHours: round2(s.regularHours),
      overtimeHours: round2(s.overtimeHours),
      wage,
      tips,
      total: dayTotal,
    });
    total += dayTotal;
  }

  return { days, total: round2(total) };
}
