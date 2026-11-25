/**
 * Did the night's drawer tie out? Night level only, never per person.
 *
 * Expected in the drawer = cash sales less cash tips paid out of it (the same
 * figure the payroll tips card shows). NULL cash sales means the POS did not
 * send the split, which is "cannot say", never "balanced".
 */
export type TieOutInput = {
  cashSales: number | null;
  cardSales?: number | null;
  cashTips: number;
  ccTips: number;
  countedCash: number | null;
  tipsPaidOut?: number | null;
};

export type TieOut = {
  state: 'balanced' | 'over' | 'short' | 'cannot-tie-out';
  reason: 'no-cash-split' | 'no-count' | null;
  expected: number | null;
  /** Counted less expected, in dollars. Positive is over. Null unless tied out. */
  gap: number | null;
  tipsOwed: number;
  tipsUnpaid: number | null;
};

// Same half-cent tolerance as the payout overdraw check in lib/payroll/adjustments.ts.
const HALF_CENT = 0.005;
const cents = (n: number) => Math.round(n * 100) / 100;

export function tieOut(i: TieOutInput): TieOut {
  const tipsOwed = cents(i.cashTips + i.ccTips);
  const tipsUnpaid = i.tipsPaidOut == null ? null : cents(tipsOwed - i.tipsPaidOut);
  const common = { tipsOwed, tipsUnpaid };

  if (i.cashSales === null) {
    return { state: 'cannot-tie-out', reason: 'no-cash-split', expected: null, gap: null, ...common };
  }
  const expected = cents(i.cashSales - i.cashTips);
  if (i.countedCash === null) {
    return { state: 'cannot-tie-out', reason: 'no-count', expected, gap: null, ...common };
  }
  const raw = i.countedCash - expected;
  if (Math.abs(raw) <= HALF_CENT) return { state: 'balanced', reason: null, expected, gap: 0, ...common };
  return { state: raw > 0 ? 'over' : 'short', reason: null, expected, gap: cents(raw), ...common };
}
