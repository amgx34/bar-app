import { describe, it, expect } from 'vitest';
import { buildStub } from './stub';
import type { SnapshotEntry } from '@/lib/payroll/run-diff';

const breakdown = {
  role: 'bartender', regularHours: 30, overtimeHours: 2, hourlyRate: 12,
  regularPay: 360, overtimePay: 36, tipAmount: 240, tipsPerHour: 7.5,
  effectiveHourlyRate: 19.5, payType: 'pool',
};

const full: SnapshotEntry = {
  employeeId: 'a', employeeName: 'Dana', totalHours: 32, totalCompensation: 636,
  breakdown, shifts: [{ date: '2026-09-01', hours: 8, isOpener: true }],
};

const legacy: SnapshotEntry = {
  employeeId: 'b', employeeName: 'Sam', totalHours: 20, totalCompensation: 400,
};

describe('buildStub', () => {
  it('returns only the named employee, never the whole run', () => {
    const stub = buildStub([full, legacy], 'a');
    expect(stub?.employeeName).toBe('Dana');
    expect(stub?.totalPay).toBe(636);
  });

  it('returns null for an employee not in the run', () => {
    // A period somebody did not work is not an empty stub, it is no stub.
    expect(buildStub([full], 'nobody')).toBeNull();
  });

  it('marks a legacy entry as having no recorded detail', () => {
    const stub = buildStub([legacy], 'b');
    expect(stub?.detailRecorded).toBe(false);
    expect(stub?.breakdown).toBeNull();
    expect(stub?.shifts).toEqual([]);
  });

  it('never invents a breakdown for a legacy entry', () => {
    // The totals must survive untouched; the detail must stay absent rather
    // than be reconstructed from figures nobody approved.
    const stub = buildStub([legacy], 'b');
    expect(stub?.totalHours).toBe(20);
    expect(stub?.totalPay).toBe(400);
  });

  it('reports recorded detail when the breakdown is present', () => {
    const stub = buildStub([full], 'a');
    expect(stub?.detailRecorded).toBe(true);
    expect(stub?.breakdown?.tipAmount).toBe(240);
    expect(stub?.shifts).toHaveLength(1);
  });

  it('carries the tip pool context through, and defaults it to empty', () => {
    const withPool = buildStub(
      [{ ...full, tipContext: [{ date: '2026-09-01', poolTotal: 1200 }] }],
      'a',
    );
    expect(withPool?.tipContext).toEqual([{ date: '2026-09-01', poolTotal: 1200 }]);
    // A legacy run has no pool figures, and must not report a zero pool.
    expect(buildStub([legacy], 'b')?.tipContext).toEqual([]);
  });

  it('leaks nothing about another employee in the returned object', () => {
    // The snapshot is the WHOLE run's pay. This is the narrowing that stops a
    // barback being handed the payroll of the entire bar.
    const stub = buildStub([full, legacy], 'a');
    expect(JSON.stringify(stub)).not.toContain('Sam');
    expect(JSON.stringify(stub)).not.toContain('400');
  });
});
