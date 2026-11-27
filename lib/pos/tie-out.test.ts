import { describe, it, expect } from 'vitest';
import { tieOut } from './tie-out';

const base = { cashSales: 1000, cardSales: 2000, cashTips: 100, ccTips: 300, countedCash: 900 };

describe('tieOut', () => {
  it('expects cash sales less cash tips and balances on an exact count', () => {
    const r = tieOut(base);
    expect(r.state).toBe('balanced');
    expect(r.expected).toBe(900);
    expect(r.gap).toBe(0);
  });

  it('never balances when the POS did not send the cash split (NULL is not zero)', () => {
    const r = tieOut({ ...base, cashSales: null, countedCash: 0 });
    expect(r.state).toBe('cannot-tie-out');
    expect(r.reason).toBe('no-cash-split');
    expect(r.expected).toBeNull();
  });

  it('a reported zero is a real zero: counting 0 on a card-only night balances', () => {
    const r = tieOut({ ...base, cashSales: 0, cashTips: 0, countedCash: 0 });
    expect(r.state).toBe('balanced');
  });

  it('cannot tie out before a count is entered', () => {
    const r = tieOut({ ...base, countedCash: null });
    expect(r.state).toBe('cannot-tie-out');
    expect(r.reason).toBe('no-count');
  });

  it('names a one-cent gap', () => {
    expect(tieOut({ ...base, countedCash: 900.01 })).toMatchObject({ state: 'over', gap: 0.01 });
    expect(tieOut({ ...base, countedCash: 899.99 })).toMatchObject({ state: 'short', gap: -0.01 });
  });

  it('follows the half-cent payout tolerance', () => {
    expect(tieOut({ ...base, countedCash: 900.004 }).state).toBe('balanced');
    expect(tieOut({ ...base, countedCash: 900.006 }).state).toBe('over');
  });

  it('owes card tips plus cash tips, and the unpaid remainder when paid-out is known', () => {
    expect(tieOut(base).tipsOwed).toBe(400);
    expect(tieOut(base).tipsUnpaid).toBeNull();
    expect(tieOut({ ...base, tipsPaidOut: 250 }).tipsUnpaid).toBe(150);
  });
});

describe('tieOut when cash tips were never entered', () => {
  it('does not call a short on a night whose cash tips are an unentered 0', () => {
    const r = tieOut({ ...base, cashTips: 0, cashTipsCounted: false, countedCash: 900 });
    expect(r.state).toBe('cannot-tie-out');
    expect(r.reason).toBe('tips-not-entered');
    expect(r.gap).toBeNull();
  });

  it('still ties out once a person entered the tips, even if the figure is 0', () => {
    const r = tieOut({ ...base, cashTips: 0, cashTipsCounted: true, countedCash: 1000 });
    expect(r.state).toBe('balanced');
  });

  it('no-cash-split still wins over tips-not-entered', () => {
    const r = tieOut({ ...base, cashSales: null, cashTips: 0, cashTipsCounted: false });
    expect(r.reason).toBe('no-cash-split');
  });
});
