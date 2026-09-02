import { describe, it, expect } from 'vitest';
import {
  summarizePayouts,
  isPayoutMethod,
  type Payout,
  type PayableEntry,
} from './payouts';

const entry = (id: string, pay: number): PayableEntry =>
  ({ employeeId: id, totalCompensation: pay });

const paid = (id: string, amount = 0): Payout =>
  ({ employeeId: id, method: 'cash', amountPaid: amount, paidAt: '2026-09-01T00:00:00Z' });

const map = (...rows: Payout[]) => new Map(rows.map((r) => [r.employeeId, r]));

describe('summarizePayouts', () => {
  it('counts everyone as owed when nothing is paid', () => {
    const s = summarizePayouts([entry('1', 800), entry('2', 500)], new Map());
    expect(s.paidCount).toBe(0);
    expect(s.totalCount).toBe(2);
    expect(s.total).toBe(1300);
    expect(s.outstanding).toBe(1300);
    expect(s.allPaid).toBe(false);
  });

  it('drops a paid person out of the outstanding figure', () => {
    const s = summarizePayouts([entry('1', 800), entry('2', 500)], map(paid('1', 800)));
    expect(s.paidCount).toBe(1);
    expect(s.outstanding).toBe(500);
    expect(s.total).toBe(1300);
    expect(s.allPaid).toBe(false);
  });

  it('reports allPaid only when the run is fully covered', () => {
    const s = summarizePayouts([entry('1', 800), entry('2', 500)], map(paid('1'), paid('2')));
    expect(s.paidCount).toBe(2);
    expect(s.outstanding).toBe(0);
    expect(s.allPaid).toBe(true);
  });

  it('is not allPaid on an empty run', () => {
    // Nobody worked. "All paid" would be a green tick over an empty period.
    expect(summarizePayouts([], new Map()).allPaid).toBe(false);
  });

  it('owes the live figure, not the frozen one', () => {
    // Marcus was paid $800; a later correction put the run at $850. The $50 is
    // NOT outstanding — the payout row is what settles him, not the amount.
    const s = summarizePayouts([entry('1', 850)], map(paid('1', 800)));
    expect(s.outstanding).toBe(0);
    expect(s.total).toBe(850);
  });

  it('ignores a payout for somebody no longer on the run', () => {
    // Their last shift was corrected away after they were paid. paidCount must
    // never exceed totalCount or the progress strip reads "3 of 2".
    const s = summarizePayouts([entry('1', 800)], map(paid('1'), paid('ghost')));
    expect(s.paidCount).toBe(1);
    expect(s.totalCount).toBe(1);
    expect(s.allPaid).toBe(true);
  });

  it('leaves a zero-pay person countable but costless', () => {
    const s = summarizePayouts([entry('1', 0), entry('2', 500)], new Map());
    expect(s.totalCount).toBe(2);
    expect(s.outstanding).toBe(500);
  });
});

describe('isPayoutMethod', () => {
  it('accepts the four constrained values', () => {
    expect(isPayoutMethod('cash')).toBe(true);
    expect(isPayoutMethod('direct_deposit')).toBe(true);
    expect(isPayoutMethod('check')).toBe(true);
    expect(isPayoutMethod('other')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isPayoutMethod('venmo')).toBe(false);
    expect(isPayoutMethod('')).toBe(false);
    expect(isPayoutMethod(null)).toBe(false);
    expect(isPayoutMethod(undefined)).toBe(false);
  });
});
