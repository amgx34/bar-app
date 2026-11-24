import { describe, it, expect } from 'vitest';
import { diffPayrollRun, type SnapshotEntry } from './run-diff';
import type { Withholding } from './tax/types';

const e = (id: string, name: string, hours: number, pay: number): SnapshotEntry =>
  ({ employeeId: id, employeeName: name, totalHours: hours, totalCompensation: pay });

describe('diffPayrollRun', () => {
  it('reports nothing stale when the recompute matches', () => {
    const rows = [e('1', 'Marcus', 32, 800), e('2', 'Ada', 20, 500)];
    const d = diffPayrollRun(rows, rows);
    expect(d.isStale).toBe(false);
    expect(d.changes).toEqual([]);
    expect(d.payDelta).toBe(0);
  });

  it('catches changed hours', () => {
    const d = diffPayrollRun([e('1', 'Marcus', 32, 800)], [e('1', 'Marcus', 34, 850)]);
    expect(d.isStale).toBe(true);
    expect(d.changes[0]).toMatchObject({ kind: 'changed', hoursBefore: 32, hoursAfter: 34 });
    expect(d.payDelta).toBe(50);
  });

  it('catches a pay change even when hours are identical', () => {
    // A tip adjustment moves money without touching the clock.
    const d = diffPayrollRun([e('1', 'Marcus', 32, 800)], [e('1', 'Marcus', 32, 875)]);
    expect(d.isStale).toBe(true);
    expect(d.changes[0].kind).toBe('changed');
  });

  it('catches an employee added after submission', () => {
    const d = diffPayrollRun([e('1', 'Marcus', 32, 800)], [e('1', 'Marcus', 32, 800), e('2', 'Ada', 8, 200)]);
    expect(d.changes).toHaveLength(1);
    expect(d.changes[0]).toMatchObject({ kind: 'added', employeeName: 'Ada', payAfter: 200 });
  });

  it('catches an employee removed after submission', () => {
    const d = diffPayrollRun([e('1', 'Marcus', 32, 800), e('2', 'Ada', 8, 200)], [e('1', 'Marcus', 32, 800)]);
    expect(d.changes).toHaveLength(1);
    expect(d.changes[0]).toMatchObject({ kind: 'removed', employeeName: 'Ada', payBefore: 200 });
  });

  it('ignores sub-cent float drift between two computations', () => {
    // 0.1 + 0.2 style noise must not make every run look stale.
    const d = diffPayrollRun([e('1', 'Marcus', 32, 800)], [e('1', 'Marcus', 32, 800.0001)]);
    expect(d.isStale).toBe(false);
  });

  it('treats a whole cent as a real change', () => {
    const d = diffPayrollRun([e('1', 'Marcus', 32, 800)], [e('1', 'Marcus', 32, 800.01)]);
    expect(d.isStale).toBe(true);
  });

  it('totals both sides even when the roster changed entirely', () => {
    const d = diffPayrollRun([e('1', 'Marcus', 32, 800)], [e('2', 'Ada', 10, 250)]);
    expect(d.payBefore).toBe(800);
    expect(d.payAfter).toBe(250);
    expect(d.payDelta).toBe(-550);
    expect(d.changes).toHaveLength(2);
  });

  it('handles an empty snapshot against an empty recompute', () => {
    const d = diffPayrollRun([], []);
    expect(d.isStale).toBe(false);
    expect(d.payDelta).toBe(0);
  });

  it('ignores the portal fields entirely when deciding staleness', () => {
    // The employee portal widened the snapshot with a breakdown, the nights
    // worked, and the tip pool. Staleness must keep meaning "somebody's hours
    // or pay moved" — so two entries agreeing on the four original fields are
    // NOT stale even when every added field disagrees. If diffPayrollRun ever
    // starts reading them, this fails and says why.
    const before: SnapshotEntry[] = [{
      employeeId: 'a', employeeName: 'Dana', totalHours: 10, totalCompensation: 200,
      breakdown: {
        role: 'bartender', regularHours: 10, overtimeHours: 0, hourlyRate: 12,
        regularPay: 120, overtimePay: 0, tipAmount: 80, tipsPerHour: 8,
        effectiveHourlyRate: 20, payType: 'pool',
      },
      shifts: [{ date: '2026-09-01', hours: 10, isOpener: false }],
      tipContext: [{ date: '2026-09-01', poolTotal: 1200 }],
    }];
    const after: SnapshotEntry[] = [{
      employeeId: 'a', employeeName: 'Dana', totalHours: 10, totalCompensation: 200,
      breakdown: {
        role: 'barback', regularHours: 4, overtimeHours: 6, hourlyRate: 30,
        regularPay: 1, overtimePay: 999, tipAmount: 4242, tipsPerHour: 1,
        effectiveHourlyRate: 3, payType: 'hourly',
      },
      shifts: [{ date: '2026-09-07', hours: 2, isOpener: true }],
      tipContext: [{ date: '2026-09-07', poolTotal: 9 }],
    }];

    expect(diffPayrollRun(before, after).isStale).toBe(false);
    expect(diffPayrollRun(before, after).changes).toHaveLength(0);
  });
});

const wh = (total: number): Withholding => ({
  status: 'withheld',
  federalIncome: total, socialSecurity: 0, medicare: 0,
  additionalMedicare: 0, state: 0, total,
  uncollected: {
    federalIncome: 0, socialSecurity: 0, medicare: 0,
    additionalMedicare: 0, state: 0, total: 0,
  },
  notes: [],
});

describe('withholding is carried but not compared', () => {
  const base: SnapshotEntry = {
    employeeId: 'e1', employeeName: 'Alex', totalHours: 40, totalCompensation: 800,
  };

  // Catches: a diff that compares withholding.total (or the whole entry), which
  // would put every open run into "somebody's numbers moved" when a tax table
  // is re-transcribed. Pay and hours are identical, so only withholding differs.
  it('a changed withholding total does not make a run stale', () => {
    const diff = diffPayrollRun(
      [{ ...base, withholding: wh(100) }],
      [{ ...base, withholding: wh(140) }],
    );
    expect(diff.isStale).toBe(false);
    expect(diff.changes).toEqual([]);
  });

  // Catches: a run approved before withholding existed (no field) going stale
  // against a recompute that now carries one.
  it('a snapshot with no withholding against one with it is not stale', () => {
    const diff = diffPayrollRun([base], [{ ...base, withholding: wh(100) }]);
    expect(diff.isStale).toBe(false);
  });

  // Catches: the field being "ignored" by disabling the comparison altogether.
  // Withholding is identical on both sides, so only pay can have made it stale.
  it('still goes stale when pay moves, withholding unchanged', () => {
    const diff = diffPayrollRun(
      [{ ...base, withholding: wh(100) }],
      [{ ...base, totalCompensation: 900, withholding: wh(100) }],
    );
    expect(diff.isStale).toBe(true);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0].payAfter).toBe(900);
  });
});
