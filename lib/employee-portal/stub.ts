/**
 * One employee's slice of an approved pay run.
 *
 * Pure — no database, no clock.
 *
 * WHY A PROJECTION AND NOT A QUERY
 *
 * The snapshot holds the whole run: every employee's pay is in that JSON blob.
 * The portal must show exactly one person's, so the narrowing happens in one
 * tested function rather than being re-derived at each call site. A page that
 * forgot to filter would render the payroll of the entire bar to a barback.
 *
 * LEGACY ENTRIES
 *
 * Runs approved before the portal existed carry only four fields. Those project
 * to totals with `detailRecorded: false`, and the UI says the detail was not
 * recorded for that period. Reconstructing a breakdown by recomputing would
 * produce numbers nobody signed off, presented as though they had been.
 */

import type {
  SnapshotEntry, PayBreakdown, ShiftNight, TipNight,
} from '@/lib/payroll/run-diff';

export type PayStub = {
  employeeId:   string;
  employeeName: string;
  totalHours:   number;
  totalPay:     number;
  /** Null for a run frozen before the breakdown was recorded. */
  breakdown:    PayBreakdown | null;
  shifts:       ShiftNight[];
  /** The bar's pool on each night worked. Empty for a legacy run. */
  tipContext:   TipNight[];
  /** False when this run predates the wider snapshot. Drives the UI's caveat. */
  detailRecorded: boolean;
};

export function buildStub(
  snapshot: readonly SnapshotEntry[],
  employeeId: string,
): PayStub | null {
  const entry = (snapshot ?? []).find((e) => e.employeeId === employeeId);
  // A period this person did not work is not an empty stub, it is no stub.
  if (!entry) return null;

  return {
    employeeId:     entry.employeeId,
    employeeName:   entry.employeeName,
    totalHours:     entry.totalHours,
    totalPay:       entry.totalCompensation,
    breakdown:      entry.breakdown ?? null,
    shifts:         entry.shifts ?? [],
    tipContext:     entry.tipContext ?? [],
    detailRecorded: entry.breakdown !== undefined,
  };
}
