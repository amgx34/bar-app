import { describe, it, expect } from 'vitest';
import { planBulkPayout, type BulkPayableEntry } from './payouts';

const staff: BulkPayableEntry[] = [
  { employeeId: 'a', employeeName: 'Dave Ramos',     totalCompensation: 1204.5 },
  { employeeId: 'b', employeeName: 'Xavier Dichiara', totalCompensation: 980 },
  { employeeId: 'c', employeeName: 'Sam Oyelaran',    totalCompensation: 1042.25 },
];

const paid = (m: Record<string, number>) => new Map(Object.entries(m));

describe('planBulkPayout', () => {
  it('pays the full figure to anyone who has had nothing', () => {
    const plan = planBulkPayout(staff, paid({}));
    expect(plan.lines).toHaveLength(3);
    expect(plan.total).toBe(3226.75);
    expect(plan.skipped).toEqual([]);
  });

  it('pays the BALANCE to someone who took an advance', () => {
    // The whole reason this cannot just hand everyone totalCompensation: Sam
    // drew $300 on Tuesday, and paying the full figure now would pay that
    // advance a second time.
    const plan = planBulkPayout(staff, paid({ c: 300 }));

    const sam = plan.lines.find((l) => l.employeeId === 'c')!;
    expect(sam.amount).toBe(742.25);
    expect(sam.alreadyPaid).toBe(300);
    expect(plan.total).toBe(2926.75);
  });

  it('skips anyone already square rather than writing a zero payment', () => {
    // A zero-amount row is a payment that did not happen, and it would sit in
    // that person's payments list forever looking like one that did.
    const plan = planBulkPayout(staff, paid({ b: 980 }));

    expect(plan.lines.map((l) => l.employeeId)).toEqual(['a', 'c']);
    expect(plan.skipped).toEqual([
      { employeeId: 'b', employeeName: 'Xavier Dichiara', reason: 'already-paid' },
    ]);
  });

  it('skips someone a downward recompute has overpaid', () => {
    // Negative balance is not a debt this screen may assert, and it is
    // certainly not a payment.
    const plan = planBulkPayout(staff, paid({ a: 1500 }));

    expect(plan.lines.map((l) => l.employeeId)).toEqual(['b', 'c']);
    expect(plan.skipped[0]).toMatchObject({ employeeId: 'a', reason: 'already-paid' });
  });

  it('treats a sub-cent remainder as square', () => {
    // Float subtraction leaves crumbs. A third of a cent is not a payday, and
    // NUMERIC(12,2) would store it as 0.00 anyway.
    const plan = planBulkPayout(
      [{ employeeId: 'a', employeeName: 'Dave Ramos', totalCompensation: 1204.5 }],
      paid({ a: 1204.497 }),
    );
    expect(plan.lines).toEqual([]);
    expect(plan.skipped[0].reason).toBe('already-paid');
  });

  it('rounds each line to real money so the dialog total is the written total', () => {
    const plan = planBulkPayout(
      [{ employeeId: 'a', employeeName: 'Dave Ramos', totalCompensation: 100.005 }],
      paid({}),
    );
    expect(plan.lines[0].amount).toBe(100.01);
    expect(plan.total).toBe(100.01);
  });

  it('is empty, not broken, when there is nobody to pay', () => {
    expect(planBulkPayout([], paid({}))).toEqual({ lines: [], skipped: [], total: 0 });
  });

  it('names everyone it refuses, so a partial run can be reported', () => {
    // Paying 2 of 3 and saying "done" is the silent-success failure this
    // codebase keeps having to fix. The caller can only report a skip it was
    // told about.
    const plan = planBulkPayout(staff, paid({ a: 1204.5, b: 980 }));

    expect(plan.lines).toHaveLength(1);
    expect(plan.skipped.map((s) => s.employeeName))
      .toEqual(['Dave Ramos', 'Xavier Dichiara']);
  });
});
