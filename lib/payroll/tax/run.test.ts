import { describe, it, expect } from 'vitest';
import { ytdRange, snapshotWithholding, periodFrequencyMismatch, type RunWithholding } from './run';

describe('periodFrequencyMismatch', () => {
  // Catches: the default one-week review being taxed as a biweekly cheque,
  // which annualises a week's pay at x26 and under-withholds by ~80%.
  it('refuses a one-week period when pay is biweekly', () => {
    const m = periodFrequencyMismatch('2026-11-02', '2026-11-08', 'biweekly');
    expect(m).toMatch(/7 days/);
    expect(m).toMatch(/every two weeks/);
  });
  it('refuses a two-week period when pay is weekly', () => {
    expect(periodFrequencyMismatch('2026-10-26', '2026-11-08', 'weekly')).not.toBeNull();
  });
  it('accepts the matching lengths', () => {
    expect(periodFrequencyMismatch('2026-11-02', '2026-11-08', 'weekly')).toBeNull();
    expect(periodFrequencyMismatch('2026-10-26', '2026-11-08', 'biweekly')).toBeNull();
    expect(periodFrequencyMismatch('2026-11-01', '2026-11-15', 'semimonthly')).toBeNull(); // 15 days
    expect(periodFrequencyMismatch('2026-02-16', '2026-02-28', 'semimonthly')).toBeNull(); // 13 days
    expect(periodFrequencyMismatch('2026-10-16', '2026-10-31', 'semimonthly')).toBeNull(); // 16 days
    expect(periodFrequencyMismatch('2026-02-01', '2026-02-28', 'monthly')).toBeNull();     // 28 days
    expect(periodFrequencyMismatch('2026-10-01', '2026-10-31', 'monthly')).toBeNull();     // 31 days
  });
  // Catches: an off-by-one counting days exclusively (Mon..Sun read as 6).
  it('counts both ends of the range', () => {
    expect(periodFrequencyMismatch('2026-11-02', '2026-11-07', 'weekly')).toMatch(/6 days/);
  });
  it('refuses a week when pay is monthly, and a month when pay is semimonthly', () => {
    expect(periodFrequencyMismatch('2026-11-02', '2026-11-08', 'monthly')).not.toBeNull();
    expect(periodFrequencyMismatch('2026-10-01', '2026-10-31', 'semimonthly')).not.toBeNull();
  });
});
import type { Withholding } from './types';

const wh = (total: number): Withholding => ({
  status: 'withheld',
  federalIncome: total, socialSecurity: 0, medicare: 0,
  additionalMedicare: 0, state: 0, total,
  uncollected: { federalIncome: 0, socialSecurity: 0, medicare: 0, additionalMedicare: 0, state: 0, total: 0 },
  notes: [],
});

describe('ytdRange', () => {
  // Catches: ending the range ON the period start (computePayroll is inclusive,
  // so the first day's pay is counted twice).
  it('ends the day before the period starts', () => {
    expect(ytdRange('2026-03-02', 2026)).toEqual({ from: '2026-01-01', to: '2026-03-01' });
  });

  // Catches: naive day arithmetic that mishandles a month boundary.
  it('crosses a month boundary correctly', () => {
    expect(ytdRange('2026-03-01', 2026)).toEqual({ from: '2026-01-01', to: '2026-02-28' });
  });

  // Catches: an inverted range (Jan 1 .. Dec 31 prior year) for a period with
  // no earlier wages this year.
  it('is null when the period starts on 1 January', () => {
    expect(ytdRange('2026-01-01', 2026)).toBeNull();
  });

  // Catches: an off-by-one skip that drops the YTD fetch for the second day.
  it('covers exactly 1 January when the period starts on 2 January', () => {
    expect(ytdRange('2026-01-02', 2026)).toEqual({ from: '2026-01-01', to: '2026-01-01' });
  });
});

describe('snapshotWithholding', () => {
  // Catches: storing the key for a placeholder/missing-table year.
  it('has NO withholding key when the tables are unusable', () => {
    expect(Object.keys(snapshotWithholding({ kind: 'unusable', message: 'x' }, 'e1'))).toEqual([]);
  });

  // Catches: storing a zeroed/empty withholding when tax is off, which would
  // later read as "withheld nothing".
  it('has NO withholding key when tax is off', () => {
    expect(Object.keys(snapshotWithholding({ kind: 'off' }, 'e1'))).toEqual([]);
  });

  // Catches: returning nothing on the happy path, or another employee's figures.
  it('carries exactly that employee figures when ok', () => {
    const rw: RunWithholding = {
      kind: 'ok',
      byEmployee: new Map([['e1', wh(10)], ['e2', wh(99)]]),
    };
    expect(snapshotWithholding(rw, 'e1').withholding?.total).toBe(10);
    expect(snapshotWithholding(rw, 'e2').withholding?.total).toBe(99);
  });

  // Catches: inventing a zero entry for an employee nothing was computed for.
  it('has no key for an employee absent from an ok result', () => {
    const rw: RunWithholding = { kind: 'ok', byEmployee: new Map([['e1', wh(10)]]) };
    expect(Object.keys(snapshotWithholding(rw, 'ghost'))).toEqual([]);
  });
});
