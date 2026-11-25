import { describe, it, expect } from 'vitest';
import { approvedTotal, snapshotToEntries } from './approved-view';
import type { SnapshotEntry } from './run-diff';

const full: SnapshotEntry = {
  employeeId: 'a', employeeName: 'Ann', totalHours: 10, totalCompensation: 250,
  breakdown: {
    role: 'bartender', regularHours: 10, overtimeHours: 0, hourlyRate: 15,
    regularPay: 150, overtimePay: 0, tipAmount: 100, tipsPerHour: 10,
    effectiveHourlyRate: 25, payType: 'hourly',
  },
};
const legacy: SnapshotEntry = { employeeId: 'b', employeeName: 'Bo', totalHours: 5, totalCompensation: 60 };

describe('approvedTotal', () => {
  it('sums what was frozen, not anything recomputed', () => {
    expect(approvedTotal([full, legacy])).toBe(310);
    expect(approvedTotal([])).toBe(0);
  });
});

describe('snapshotToEntries', () => {
  it('reads the breakdown from the snapshot', () => {
    const [e] = snapshotToEntries([full]);
    expect(e).toMatchObject({ employeeId: 'a', regularPay: 150, tipAmount: 100, totalCompensation: 250, hasDetail: true });
  });
  it('keeps a pre-breakdown run as totals only, never inventing a split', () => {
    const [e] = snapshotToEntries([legacy]);
    expect(e).toMatchObject({ totalCompensation: 60, totalHours: 5, regularPay: 0, tipAmount: 0, hasDetail: false });
  });
});
