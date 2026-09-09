import { describe, it, expect } from 'vitest';
import {
  summarizePayouts,
  totalPaidTo,
  remainingAdvanceCapacity,
  isPayoutMethod,
  type Payout,
  type PayableEntry,
} from './payouts';

const entry = (id: string, pay: number): PayableEntry =>
  ({ employeeId: id, totalCompensation: pay });

const paid = (id: string, amount = 0, payoutId = `p-${id}-${amount}`): Payout =>
  ({
    id: payoutId, employeeId: id, method: 'cash', amountPaid: amount,
    paidAt: '2026-09-01T00:00:00Z', coversDays: null,
  });

/** Groups rows the way the payroll screen does — a list per employee. */
const map = (...rows: Payout[]) => {
  const m = new Map<string, Payout[]>();
  for (const r of rows) {
    const list = m.get(r.employeeId) ?? [];
    list.push(r);
    m.set(r.employeeId, list);
  }
  return m;
};

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
    const s = summarizePayouts(
      [entry('1', 800), entry('2', 500)],
      map(paid('1', 800), paid('2', 500)),
    );
    expect(s.paidCount).toBe(2);
    expect(s.outstanding).toBe(0);
    expect(s.allPaid).toBe(true);
  });

  it('is not allPaid on an empty run', () => {
    // Nobody worked. "All paid" would be a green tick over an empty period.
    expect(summarizePayouts([], new Map()).allPaid).toBe(false);
  });

  it('owes the balance, not the whole live figure, once something has been paid', () => {
    // Marcus was paid $800; a later correction put the run at $850. Only the
    // $50 gap is outstanding — the ledger tracks a running balance, not a
    // settled/unsettled flag that a frozen payout row used to stand in for.
    const s = summarizePayouts([entry('1', 850)], map(paid('1', 800)));
    expect(s.outstanding).toBe(50);
    expect(s.total).toBe(850);
  });

  it('ignores a payout for somebody no longer on the run', () => {
    // Their last shift was corrected away after they were paid. paidCount must
    // never exceed totalCount or the progress strip reads "3 of 2".
    const s = summarizePayouts([entry('1', 800)], map(paid('1', 800), paid('ghost', 400)));
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

describe('summarizePayouts with a ledger', () => {
  it('leaves only the balance outstanding after a partial payment', () => {
    // The whole point of advances: $300 of Dana's $800 has been handed over,
    // so $500 is still owed — not $800, which is what counting existence did.
    const s = summarizePayouts([entry('1', 800)], map(paid('1', 300)));
    expect(s.outstanding).toBe(500);
    expect(s.paidCount).toBe(0);
    expect(s.allPaid).toBe(false);
  });

  it('counts somebody covered by two payments as paid', () => {
    const s = summarizePayouts([entry('1', 800)], map(paid('1', 300), paid('1', 500)));
    expect(s.paidCount).toBe(1);
    expect(s.outstanding).toBe(0);
    expect(s.allPaid).toBe(true);
  });

  it('clamps an overpayment to zero rather than reporting negative owed', () => {
    // Possible when a run is recomputed downward after a payment. Not the
    // summary's job to editorialise; the payments list shows what happened.
    const s = summarizePayouts([entry('1', 800)], map(paid('1', 900)));
    expect(s.outstanding).toBe(0);
    expect(s.paidCount).toBe(1);
  });

  it('reports what has gone out to people who are not yet fully paid', () => {
    // Without this the screen implies no money has moved when in fact $300 has.
    const s = summarizePayouts(
      [entry('1', 800), entry('2', 500)],
      map(paid('1', 300), paid('2', 500)),
    );
    expect(s.advancedTotal).toBe(300);
    expect(s.outstanding).toBe(500);
  });

  it('ignores payouts for people no longer on the run', () => {
    const s = summarizePayouts([entry('1', 800)], map(paid('1', 800), paid('9', 400)));
    expect(s.paidCount).toBe(1);
    expect(s.totalCount).toBe(1);
  });
});

describe('totalPaidTo', () => {
  it('sums the payments on the list', () => {
    expect(totalPaidTo([paid('1', 300), paid('1', 500)])).toBe(800);
  });

  it('is zero for nobody recorded', () => {
    expect(totalPaidTo(undefined)).toBe(0);
    expect(totalPaidTo([])).toBe(0);
  });
});

describe('remainingAdvanceCapacity', () => {
  it('is what has been earned, less what has been handed over', () => {
    expect(remainingAdvanceCapacity(610, 240)).toBe(370);
  });

  it('is zero, never negative, when somebody has been overpaid', () => {
    // The app cannot claw money back, so an overpayment allows no more.
    expect(remainingAdvanceCapacity(300, 500)).toBe(0);
  });

  it('is the full amount when nothing has been paid', () => {
    expect(remainingAdvanceCapacity(610, 0)).toBe(610);
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
