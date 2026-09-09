import { describe, it, expect } from 'vitest';
import { netOfAdvances } from './ach-net';
import type { Payout } from './payouts';

function payout(employeeId: string, amountPaid: number): Payout {
  return {
    id: `${employeeId}-${amountPaid}`,
    employeeId,
    method: 'cash',
    amountPaid,
    paidAt: '2026-09-08T00:00:00Z',
    coversDays: null,
  };
}

describe('netOfAdvances', () => {
  it('sends the full gross when nothing has been advanced', () => {
    const [out] = netOfAdvances(
      [{ employeeId: 'a', totalCompensation: 800 }],
      new Map(),
    );
    expect(out.netAmount).toBe(800);
    expect(out.gross).toBe(800);
    expect(out.alreadyPaid).toBe(0);
  });

  it('subtracts a cash advance from the ACH amount', () => {
    // The load-bearing case: a $240 cash advance must reduce the ACH send,
    // not leave it paying the gross total on top.
    const [out] = netOfAdvances(
      [{ employeeId: 'a', totalCompensation: 800 }],
      new Map([['a', [payout('a', 240)]]]),
    );
    expect(out.netAmount).toBe(560);
    expect(out.alreadyPaid).toBe(240);
  });

  it('sums multiple payments against one employee', () => {
    const [out] = netOfAdvances(
      [{ employeeId: 'a', totalCompensation: 800 }],
      new Map([['a', [payout('a', 240), payout('a', 60)]]]),
    );
    expect(out.netAmount).toBe(500);
  });

  it('drops an employee who has already been paid in full', () => {
    const out = netOfAdvances(
      [{ employeeId: 'a', totalCompensation: 800 }],
      new Map([['a', [payout('a', 800)]]]),
    );
    expect(out).toHaveLength(0);
  });

  it('clamps to zero rather than a negative amount when overpaid', () => {
    const out = netOfAdvances(
      [{ employeeId: 'a', totalCompensation: 800 }],
      new Map([['a', [payout('a', 950)]]]),
    );
    expect(out).toHaveLength(0);
  });

  it('leaves employees with no advance untouched, and nets only the ones with one', () => {
    const out = netOfAdvances(
      [
        { employeeId: 'a', totalCompensation: 800 },
        { employeeId: 'b', totalCompensation: 500 },
      ],
      new Map([['a', [payout('a', 240)]]]),
    );
    expect(out.find((e) => e.employeeId === 'a')?.netAmount).toBe(560);
    expect(out.find((e) => e.employeeId === 'b')?.netAmount).toBe(500);
  });

  it('preserves the extra fields of the entry passed in', () => {
    const [out] = netOfAdvances(
      [{ employeeId: 'a', totalCompensation: 800, employeeName: 'Dana' }],
      new Map(),
    );
    expect(out.employeeName).toBe('Dana');
  });
});
