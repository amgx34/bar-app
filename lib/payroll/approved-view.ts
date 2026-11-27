import type { PayrollEntry } from '@/app/(app)/app/payroll/actions';
import type { SnapshotEntry } from './run-diff';

/** A pay-run row rebuilt from the frozen snapshot. `hasDetail` is false for runs frozen before breakdowns existed. */
export type FrozenEntry = PayrollEntry & { hasDetail: boolean };

export function approvedTotal(snapshot: readonly SnapshotEntry[]): number {
  return snapshot.reduce((s, e) => s + (Number(e.totalCompensation) || 0), 0);
}

/**
 * What an approved run shows: the figures somebody signed off, not a recompute.
 * Old snapshots carry totals only, so the split stays zero rather than guessed.
 */
export function snapshotToEntries(snapshot: readonly SnapshotEntry[]): FrozenEntry[] {
  return snapshot.map((e) => {
    const b = e.breakdown;
    return {
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      role: b?.role ?? null,
      totalHours: e.totalHours,
      regularHours: b?.regularHours ?? 0,
      overtimeHours: b?.overtimeHours ?? 0,
      hourlyRate: b?.hourlyRate ?? 0,
      regularPay: b?.regularPay ?? 0,
      overtimePay: b?.overtimePay ?? 0,
      tipAmount: b?.tipAmount ?? 0,
      tipsPerHour: b?.tipsPerHour ?? 0,
      effectiveHourlyRate: b?.effectiveHourlyRate ?? 0,
      totalCompensation: e.totalCompensation,
      payType: (b?.payType ?? 'hourly') as PayrollEntry['payType'],
      hasDetail: Boolean(b),
    };
  });
}
