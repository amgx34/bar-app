// lib/payroll/tax/federal.test.ts
import { describe, it, expect } from 'vitest';
import { annualTaxFromBrackets, adjustedAnnualWage, computeFederalIncome } from './federal';
import type { EmployeeTaxProfile, TaxBracket, TaxTables } from './types';

// A deliberately simple table, so these tests prove the ARITHMETIC rather than
// re-asserting the transcription (which tables/2026.test.ts owns).
const SIMPLE: TaxBracket[] = [
  { floor: 0,      base: 0,    rate: 0.10 },
  { floor: 10_000, base: 1000, rate: 0.20 },
  { floor: 50_000, base: 9000, rate: 0.30 },
];

describe('annualTaxFromBrackets', () => {
  it('is zero at zero income', () => {
    expect(annualTaxFromBrackets(SIMPLE, 0)).toBe(0);
  });

  it('applies the first bracket rate below the first ceiling', () => {
    expect(annualTaxFromBrackets(SIMPLE, 5_000)).toBeCloseTo(500, 2);
  });

  it('applies base plus rate on the excess inside a middle bracket', () => {
    expect(annualTaxFromBrackets(SIMPLE, 20_000)).toBeCloseTo(1000 + 0.2 * 10_000, 2);
  });

  it('moves to the next bracket exactly at a floor', () => {
    expect(annualTaxFromBrackets(SIMPLE, 10_000)).toBeCloseTo(1000, 2);
    expect(annualTaxFromBrackets(SIMPLE, 50_000)).toBeCloseTo(9000, 2);
  });

  it('uses the top bracket above the last floor', () => {
    expect(annualTaxFromBrackets(SIMPLE, 100_000)).toBeCloseTo(9000 + 0.3 * 50_000, 2);
  });

  it('never returns negative for a negative wage', () => {
    expect(annualTaxFromBrackets(SIMPLE, -5_000)).toBe(0);
  });
});

describe('adjustedAnnualWage', () => {
  const base = {
    grossForPeriod: 1000,
    periods: 26,
    otherIncome: 0,
    deductions: 0,
    multipleJobs: false,
    standardDeduction: 8_600,
  };

  it('annualises the period wage', () => {
    // 1000 x 26 = 26,000, less the 8,600 standard-deduction adjustment.
    expect(adjustedAnnualWage(base)).toBeCloseTo(26_000 - 8_600, 2);
  });

  it('adds step 4(a) other income', () => {
    expect(adjustedAnnualWage({ ...base, otherIncome: 1_000 }))
      .toBeCloseTo(26_000 + 1_000 - 8_600, 2);
  });

  it('subtracts step 4(b) deductions', () => {
    expect(adjustedAnnualWage({ ...base, deductions: 2_000 }))
      .toBeCloseTo(26_000 - 2_000 - 8_600, 2);
  });

  it('skips the standard-deduction adjustment when step 2 is checked', () => {
    // The step-2 tables already account for it; subtracting twice under-withholds.
    const unchecked = adjustedAnnualWage(base);
    const checked   = adjustedAnnualWage({ ...base, multipleJobs: true });
    expect(checked).toBeCloseTo(26_000, 2);
    // The two paths must differ by exactly the deduction, or the flag is inert.
    expect(checked - unchecked).toBeCloseTo(8_600, 2);
  });

  it('floors at zero rather than going negative', () => {
    expect(adjustedAnnualWage({ ...base, deductions: 999_999 })).toBe(0);
  });
});

// Purpose-built tables: the placeholder 2026 brackets are not guaranteed to make
// these numbers deterministic, and a test that depends on a stand-in would
// start failing (or worse, pass vacuously) the day real figures are transcribed.
const flat = (rate: number): TaxBracket[] => [{ floor: 0, base: 0, rate }];
const FIXTURE: TaxTables = {
  year: 2099,
  placeholder: true,
  federal: {
    standard: {
      single:            SIMPLE,
      married_jointly:   flat(0.05),
      head_of_household: flat(0.07),
    },
    step2: {
      single:            flat(0.25),
      married_jointly:   flat(0.25),
      head_of_household: flat(0.25),
    },
    standardDeduction: {
      single:            8_600,
      married_jointly:   12_000,
      head_of_household: 10_000,
    },
  },
  fica: {
    socialSecurityRate: 0.062,
    socialSecurityWageBase: 200_000,
    medicareRate: 0.0145,
    additionalMedicareRate: 0.009,
    additionalMedicareThreshold: 200_000,
  },
};

describe('computeFederalIncome', () => {
  const profile: EmployeeTaxProfile = {
    classification: 'w2',
    filingStatus: 'single',
    multipleJobs: false,
    dependentsAmount: 0,
    otherIncome: 0,
    deductions: 0,
    extraWithholding: 0,
    exempt: false,
  };
  const run = (p: EmployeeTaxProfile, gross = 2000) =>
    computeFederalIncome({ grossForPeriod: gross, profile: p, payFrequency: 'biweekly', tables: FIXTURE });

  it('computes the full worksheet for a single filer', () => {
    // 2000 x 26 = 52,000; less 8,600 = 43,400; 1000 + 0.2 x 33,400 = 7,680; / 26.
    expect(run(profile)).toBeCloseTo(7_680 / 26, 4);
  });

  it('subtracts the step 3 dependents amount from the annual figure', () => {
    const withDeps = run({ ...profile, dependentsAmount: 2600 });
    // 2600 annual over 26 periods is exactly 100 less per period.
    expect(run(profile) - withDeps).toBeCloseTo(100, 4);
  });

  it('adds step 4(c) extra withholding per period, not annually', () => {
    expect(run({ ...profile, extraWithholding: 25 }) - run(profile)).toBeCloseTo(25, 4);
  });

  it('uses the step 2 tables and no deduction when step 2 is checked', () => {
    // 52,000 x 0.25 / 26 = 500. Had the deduction been taken as well it would be
    // 0.25 x 43,400 / 26, which is lower: that is the under-withholding bug.
    const checked = run({ ...profile, multipleJobs: true });
    expect(checked).toBeCloseTo(500, 4);
    expect(checked).toBeGreaterThan(0.25 * 43_400 / 26);
  });

  it('uses the bracket set and deduction of the filing status', () => {
    // (52,000 - 12,000) x 0.05 / 26
    expect(run({ ...profile, filingStatus: 'married_jointly' })).toBeCloseTo(2_000 / 26, 4);
    // (52,000 - 10,000) x 0.07 / 26
    expect(run({ ...profile, filingStatus: 'head_of_household' })).toBeCloseTo(2_940 / 26, 4);
  });

  it('treats a profile with no W-4 entered as single with no adjustments', () => {
    const blank: EmployeeTaxProfile = {
      classification: 'w2', filingStatus: null, multipleJobs: null,
      dependentsAmount: null, otherIncome: null, deductions: null,
      extraWithholding: null, exempt: null,
    };
    expect(run(blank)).toBeCloseTo(run(profile), 6);
  });

  it('withholds nothing for an exempt employee, even with extra withholding', () => {
    expect(run({ ...profile, exempt: true, extraWithholding: 25 })).toBe(0);
  });

  it('never returns a negative amount', () => {
    const r = run({ ...profile, dependentsAmount: 50_000 }, 10);
    expect(r).toBe(0);
  });

  it('still adds extra withholding when the tax itself is zero', () => {
    expect(run({ ...profile, dependentsAmount: 50_000, extraWithholding: 25 }, 10)).toBeCloseTo(25, 6);
  });
});
