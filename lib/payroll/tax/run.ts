// lib/payroll/tax/run.ts
import { addDays } from '@/lib/date-range';
import type { Withholding } from './types';

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
