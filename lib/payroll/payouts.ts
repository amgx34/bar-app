/**
 * Who on a pay run has actually been handed their money.
 *
 * Payroll computes what is OWED; nothing until now recorded what was PAID. The
 * two are different questions and they drift apart in the obvious way — an
 * owner cuts six of eight cheques on Friday, comes back Monday, and the run
 * looks identical to the one they had not started.
 *
 * A payout is a LEDGER — an employee can have any number of payments against a
 * period, each an advance against a chosen set of days — and "unpaid" is
 * simply an empty list, never a status flag that can go stale against the run.
 *
 * The figure stored on each row is what was handed over at the time. It is NOT
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
  /** Row id. A ledger needs it: undo now targets one payment, not a period. */
  id:         string;
  employeeId: string;
  method:     PayoutMethod;
  amountPaid: number;
  paidAt:     string;
  /**
   * The days this amount was computed from, or null for the whole period.
   *
   * A receipt, never state. Days are not settled by being paid for — see the
   * design doc for why settling them underpays anybody whose later shifts push
   * their week past forty hours.
   */
  coversDays: string[] | null;
};

/** Only the two fields the summary needs, so callers need not pass whole rows. */
export type PayableEntry = {
  employeeId:        string;
  totalCompensation: number;
};

export type PayoutSummary = {
  /** People whose payments cover what the run says they are owed. */
  paidCount:   number;
  /** People on the run, paid or not. The denominator. */
  totalCount:  number;
  /** Sum of `totalCompensation` for everyone on the run. */
  total:       number;
  /** What is still to hand over: the unpaid BALANCE, not the whole figure. */
  outstanding: number;
  /**
   * Money already handed to people who are not yet fully paid.
   *
   * Without it the screen reads as though nothing has moved when in fact an
   * owner has been paying advances all week.
   */
  advancedTotal: number;
  /** True only when there is somebody to pay and nobody is left. */
  allPaid:     boolean;
};

/** What somebody has been handed for a period. Zero when nothing is recorded. */
export function totalPaidTo(payouts: readonly Payout[] | undefined): number {
  return (payouts ?? []).reduce((sum, p) => sum + p.amountPaid, 0);
}

/**
 * How far through paying out this period the bar is.
 *
 * `outstanding` is the unpaid BALANCE — the live figure minus what has already
 * been handed over — not the whole figure for anybody not yet finished. Under
 * the old one-row model those were the same number; with advances they are not,
 * and using the old rule would overstate the cash still needed by every advance
 * already paid.
 *
 * Overpayment clamps to zero rather than subtracting from somebody else's
 * balance. It happens when a run is recomputed downward after a payment, and
 * the payments list is where it should be visible, not here.
 *
 * Payouts for people no longer on the run are ignored, so `paidCount` can never
 * exceed `totalCount`.
 */
export function summarizePayouts(
  entries: readonly PayableEntry[],
  payoutsByEmployee: ReadonlyMap<string, readonly Payout[]>,
): PayoutSummary {
  let paidCount = 0;
  let total = 0;
  let outstanding = 0;
  let advancedTotal = 0;

  for (const entry of entries) {
    total += entry.totalCompensation;

    const paidSoFar = totalPaidTo(payoutsByEmployee.get(entry.employeeId));
    const balance = entry.totalCompensation - paidSoFar;

    if (balance <= 0) {
      paidCount += 1;
    } else {
      outstanding += balance;
      // Only counted for the not-yet-finished: this figure answers "how much
      // have I already put out against what is still open".
      advancedTotal += paidSoFar;
    }
  }

  return {
    paidCount,
    totalCount: entries.length,
    total,
    outstanding,
    advancedTotal,
    allPaid: entries.length > 0 && paidCount === entries.length,
  };
}

/**
 * What may still be advanced to somebody this period.
 *
 * The ceiling is total EARNED against total PAID, not the value of whichever
 * days are ticked. Days propose an amount; this decides whether the pot has
 * room. Capping against the ticked days asks a per-day question in a model that
 * deliberately has no per-day balances — it would offer somebody $60 of a $300
 * request because an earlier advance had "used up" days they had not worked yet.
 *
 * Never negative: the app cannot claw money back, so an overpayment allows no
 * further advance rather than implying a debt.
 */
export function remainingAdvanceCapacity(
  earnedSoFarThisPeriod: number,
  alreadyPaidThisPeriod: number,
): number {
  return Math.max(0, earnedSoFarThisPeriod - alreadyPaidThisPeriod);
}

/** Narrows a value off the wire — the column is CHECK-constrained, the type is not. */
export function isPayoutMethod(value: unknown): value is PayoutMethod {
  return typeof value === 'string' && (PAYOUT_METHODS as readonly string[]).includes(value);
}
