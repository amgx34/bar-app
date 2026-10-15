// lib/payroll/tax/tables/index.test.ts
import { describe, it, expect } from 'vitest';
import { tablesFor, taxYearForPeriod, periodsPerYear } from './index';

describe('taxYearForPeriod', () => {
  it('uses the year the period ends in', () => {
    expect(taxYearForPeriod('2026-03-14')).toBe(2026);
  });

  it('resolves a period crossing new year to the later year', () => {
    // Review Focus 3. A period ending 3 January is taxed on the new year's
    // tables, so the first run of January is also the first run that proves
    // the new tables were transcribed.
    expect(taxYearForPeriod('2027-01-03')).toBe(2027);
  });
});

describe('periodsPerYear', () => {
  it('maps each supported frequency', () => {
    expect(periodsPerYear('weekly')).toBe(52);
    expect(periodsPerYear('biweekly')).toBe(26);
    expect(periodsPerYear('semimonthly')).toBe(24);
    expect(periodsPerYear('monthly')).toBe(12);
  });
});

describe('tablesFor', () => {
  it('returns the tables for a year it has', () => {
    expect(tablesFor(2026).year).toBe(2026);
  });

  it('throws for a year it does not have, rather than falling back', () => {
    // The whole risk of the percentage method: a stale table under-withholds
    // silently for twelve months. Failing loudly in January is the mitigation.
    expect(() => tablesFor(2099)).toThrow(/2099/);
  });
});
