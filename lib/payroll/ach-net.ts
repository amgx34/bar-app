import { totalPaidTo, type Payout } from './payouts';

/**
 * Nets a payroll run's ACH file against advances already handed over.
 *
 * An advance is a debit against the period, never a settlement of days (see
 * the partial-payouts design doc) — so at payday the direct-deposit file must
 * send `totalCompensation` MINUS everything already paid, or a cash advance
 * plus the ACH transfer double-pays the employee. Before this helper existed
 * the ACH route sent `entry.totalCompensation` straight through and never
 * consulted `payroll_payouts` at all.
 */

export type AchNetable = {
  employeeId: string;
  totalCompensation: number;
};

export type AchNetEntry<T extends AchNetable> = T & {
  /** Gross figure the run computed for the period, before advances. */
  gross: number;
  /** Sum of every payout already recorded for this employee this period. */
  alreadyPaid: number;
  /** What the ACH file should actually send: gross minus advances, floored at 0. */
  netAmount: number;
};

/**
 * Subtracts each employee's already-paid total from their gross pay, drops
 * anyone left owing nothing (a $0 ACH entry is not a valid entry — it must
 * never appear in the file), and reports both figures on every survivor so
 * the audit log can be reconciled against the advances later.
 */
export function netOfAdvances<T extends AchNetable>(
  entries: readonly T[],
  payoutsByEmployee: ReadonlyMap<string, readonly Payout[]>,
): AchNetEntry<T>[] {
  const result: AchNetEntry<T>[] = [];

  for (const entry of entries) {
    const alreadyPaid = totalPaidTo(payoutsByEmployee.get(entry.employeeId));
    const gross = entry.totalCompensation;
    const netAmount = Math.max(0, Math.round((gross - alreadyPaid) * 100) / 100);

    if (netAmount <= 0) continue;

    result.push({ ...entry, gross, alreadyPaid, netAmount });
  }

  return result;
}
