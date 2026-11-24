// lib/payroll/tax/federal.ts
import type { EmployeeTaxProfile, FilingStatus, PayFrequency, TaxBracket, TaxTables } from './types';
import { periodsPerYear } from './tables';

/** Pub 15-T's default when a W-4 carries no filing status. */
const DEFAULT_STATUS: FilingStatus = 'single';

/**
 * Walks a percentage-method table. Each row is "base, plus rate on the amount
 * over floor"; the last row has no ceiling.
 */
export function annualTaxFromBrackets(brackets: TaxBracket[], adjustedAnnual: number): number {
  const wage = Math.max(0, adjustedAnnual);

  let row = brackets[0];
  for (const b of brackets) {
    if (wage >= b.floor) row = b;
    else break;
  }

  return row.base + row.rate * (wage - row.floor);
}

/**
 * Worksheet 1A, Step 1 — the Adjusted Annual Wage Amount.
 *
 * The standard-deduction adjustment (line 1g) applies ONLY when the Step 2
 * checkbox is clear. The step-2 tables already price it in, so subtracting it
 * there as well under-withholds every two-job household.
 */
export function adjustedAnnualWage(input: {
  grossForPeriod: number;
  periods: number;
  otherIncome: number;
  deductions: number;
  multipleJobs: boolean;
  standardDeduction: number;
}): number {
  const annual = Math.max(0, input.grossForPeriod) * input.periods;
  const adjustment = input.multipleJobs ? 0 : input.standardDeduction;
  return Math.max(0, annual + input.otherIncome - input.deductions - adjustment);
}

/**
 * Federal income tax withheld for one pay period.
 *
 * Each worksheet step is separable above rather than folded into one
 * expression: when a figure disagrees with an accountant, the only useful
 * question is which step diverged.
 */
export function computeFederalIncome(input: {
  grossForPeriod: number;
  profile: EmployeeTaxProfile;
  payFrequency: PayFrequency;
  tables: TaxTables;
}): number {
  const { profile, tables } = input;

  if (profile.exempt) return 0;

  // Every W-4 field is nullable: a newly classified employee may have none of
  // the form entered yet. Pub 15-T's own defaults apply — single, no
  // adjustments — rather than refusing to compute.
  const status       = profile.filingStatus ?? DEFAULT_STATUS;
  const multipleJobs = profile.multipleJobs ?? false;
  const periods      = periodsPerYear(input.payFrequency);

  const annual = adjustedAnnualWage({
    grossForPeriod: input.grossForPeriod,
    periods,
    otherIncome: profile.otherIncome ?? 0,
    deductions:  profile.deductions ?? 0,
    multipleJobs,
    standardDeduction: tables.federal.standardDeduction[status],
  });

  const brackets = multipleJobs
    ? tables.federal.step2[status]
    : tables.federal.standard[status];

  const tentativeAnnual = annualTaxFromBrackets(brackets, annual);

  // Step 3 — dependents, annual, floored at zero before dividing.
  const afterDependents = Math.max(0, tentativeAnnual - (profile.dependentsAmount ?? 0));

  // Step 4(c) is already per period and is added after the division.
  return afterDependents / periods + (profile.extraWithholding ?? 0);
}
