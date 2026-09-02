/**
 * Who on a pay run has actually been handed their money.
 *
 * Payroll computes what is OWED; nothing until now recorded what was PAID. The
 * two are different questions and they drift apart in the obvious way — an
 * owner cuts six of eight cheques on Friday, comes back Monday, and the run
 * looks identical to the one they had not started.
 *
 * A payout is a row per employee per period, and its absence is the unpaid
 * state — there is no status flag here that can go stale against the run.
 *
 * The figure stored on the row is what was handed over at the time. It is NOT
 * re-read from the live recompute, because a shift corrected after the fact
 * must not silently rewrite history: the point of keeping it is being able to
 * see that the two disagree.
 */

export type PayoutMethod = 'cash' | 'direct_deposit' | 'check' | 'other';

export const PAYOUT_METHODS: readonly PayoutMethod[] = [
  'cash',
  'direct_deposit',
  'check',
  'other',
] as const;

export const PAYOUT_METHOD_LABEL: Record<PayoutMethod, string> = {
  cash:           'Cash',
  direct_deposit: 'Direct deposit',
  check:          'Check',
  other:          'Other',
};

export type Payout = {
  employeeId: string;
  method:     PayoutMethod;
  amountPaid: number;
  paidAt:     string;
};

/** Only the two fields the summary needs, so callers need not pass whole rows. */
export type PayableEntry = {
  employeeId:        string;
  totalCompensation: number;
};

export type PayoutSummary = {
  /** People on the run who have a payout row. */
  paidCount:   number;
  /** People on the run, paid or not. The denominator. */
  totalCount:  number;
  /** Sum of `totalCompensation` for everyone on the run. */
  total:       number;
  /** Sum of `totalCompensation` for those with no payout row. */
  outstanding: number;
  /** True only when there is somebody to pay and nobody is left. */
  allPaid:     boolean;
};

/**
 * How far through paying out this period the bar is.
 *
 * `outstanding` deliberately sums the LIVE figure for the unpaid, not the
 * frozen one: what is still owed is whatever the run says right now. Frozen
 * amounts describe money that already moved and cannot be owed again.
 *
 * Payouts for people no longer on the run — an employee whose last shift was
 * corrected away after they were paid — are ignored rather than counted, so
 * `paidCount` can never exceed `totalCount`.
 */
export function summarizePayouts(
  entries: readonly PayableEntry[],
  payouts: ReadonlyMap<string, Payout>,
): PayoutSummary {
  let paidCount = 0;
  let total = 0;
  let outstanding = 0;

  for (const entry of entries) {
    total += entry.totalCompensation;
    if (payouts.has(entry.employeeId)) paidCount += 1;
    else outstanding += entry.totalCompensation;
  }

  return {
    paidCount,
    totalCount: entries.length,
    total,
    outstanding,
    allPaid: entries.length > 0 && paidCount === entries.length,
  };
}

/** Narrows a value off the wire — the column is CHECK-constrained, the type is not. */
export function isPayoutMethod(value: unknown): value is PayoutMethod {
  return typeof value === 'string' && (PAYOUT_METHODS as readonly string[]).includes(value);
}
