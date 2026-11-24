// lib/payroll/tax/run.ts
import { addDays } from '@/lib/date-range';
import type { PayFrequency, Withholding } from './types';

/** Inclusive day counts a real pay period of each frequency can span. */
const PERIOD_DAYS: Record<PayFrequency, { min: number; max: number; label: string }> = {
  weekly:      { min: 7,  max: 7,  label: 'every week' },
  biweekly:    { min: 14, max: 14, label: 'every two weeks' },
  semimonthly: { min: 13, max: 16, label: 'twice a month' },
  monthly:     { min: 28, max: 31, label: 'once a month' },
};

/**
 * Null when the period is one paycheck at this frequency, else the sentence to
 * show. Withholding annualises the period's pay by the frequency (x52, x26...),
 * so a one-week view under biweekly pay is taxed as if a week were a whole
 * cheque: x26 on half the pay, under-withholding by roughly 80% with no other
 * symptom. The review screen defaults to a week, so this is the common case.
 */
export function periodFrequencyMismatch(
  startDate: string,
  endDate: string,
  freq: PayFrequency,
): string | null {
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  const days = Math.round(ms / 86_400_000) + 1;
  const { min, max, label } = PERIOD_DAYS[freq];
  if (days >= min && days <= max) return null;
  return `This period is ${days} days, but you pay ${label}. Withholding is worked out per paycheck, so open a period that matches one paycheck to see it.`;
}

/**
 * Withholding for a pay run, or the reason there is none.
 *  - `off`      the bar has not switched tax on.
 *  - `unusable` the year's tables are placeholders or missing.
 *  - `ok`       figures, keyed by employee id.
 */
export type RunWithholding =
  | { kind: 'off' }
  | { kind: 'unusable'; message: string }
  | { kind: 'ok'; byEmployee: Map<string, Withholding> };

/**
 * The year-to-date range FICA needs: 1 January up to the day BEFORE the period.
 * computePayroll is inclusive on both ends, so ending on `startDate` would
 * count the period's first day twice. Null when the period starts on or before
 * 1 January: there are no earlier wages this year to fetch.
 */
export function ytdRange(startDate: string, taxYear: number): { from: string; to: string } | null {
  const from = `${taxYear}-01-01`;
  if (startDate <= from) return null;
  return { from, to: addDays(startDate, -1) };
}

/**
 * The snapshot fragment for one employee: the `withholding` key only when real
 * figures exist. For `off`/`unusable` it must be an object with NO such key —
 * `withholding: {}` or a zeroed value would later read as "withheld nothing".
 */
export function snapshotWithholding(
  rw: RunWithholding,
  employeeId: string,
): { withholding?: Withholding } {
  if (rw.kind !== 'ok') return {};
  const w = rw.byEmployee.get(employeeId);
  return w ? { withholding: w } : {};
}
