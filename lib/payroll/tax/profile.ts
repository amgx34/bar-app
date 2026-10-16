// lib/payroll/tax/profile.ts
import type { EmployeeTaxProfile, FilingStatus, TaxClassification } from './types';

const CLASSIFICATIONS: TaxClassification[] = ['w2', 'contractor_1099'];
const STATUSES: FilingStatus[] = ['single', 'married_jointly', 'head_of_household'];

/**
 * NUMERIC columns arrive as strings from postgres. NULL, '' and junk are
 * "not answered" (null); a real "0.00" is an answer and stays 0.
 * Number('') is 0 and Number(null) is 0, so those are excluded first.
 */
function num(v: unknown): number | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

export function taxProfileFromEmployee(row: Record<string, unknown>): EmployeeTaxProfile {
  const cls = row.tax_classification as TaxClassification;
  const status = row.w4_filing_status as FilingStatus;

  return {
    // An unrecognised value is unclassified, not trusted through. The CHECK
    // constraint should prevent it; a hand-edited row should not become a
    // silent withholding decision. NULL is deliberately not 'contractor_1099'.
    classification:   CLASSIFICATIONS.includes(cls) ? cls : null,
    filingStatus:     STATUSES.includes(status) ? status : null,
    multipleJobs:     bool(row.w4_multiple_jobs),
    dependentsAmount: num(row.w4_dependents_amount),
    otherIncome:      num(row.w4_other_income),
    deductions:       num(row.w4_deductions),
    extraWithholding: num(row.w4_extra_withholding),
    exempt:           bool(row.w4_exempt),
  };
}
