// lib/payroll/tax/ui.ts
import { tablesFor } from './tables';
import type { FilingStatus, TaxClassification } from './types';

export type TablesStatus =
  | { usable: true }
  | { usable: false; reason: 'missing' | 'placeholder'; message: string };

/**
 * Can this year's tables be trusted to produce a real withholding figure?
 *
 * `tablesFor` throws on an unknown year and a table may carry placeholder
 * figures; both mean the same thing to an operator: do not switch tax on
 * believing the numbers are real. Never throws.
 */
export function tablesStatus(year: number): TablesStatus {
  try {
    const t = tablesFor(year);
    if (t.placeholder) {
      return {
        usable: false,
        reason: 'placeholder',
        message:
          `The ${year} tax tables are placeholders, not the IRS figures. ` +
          `No withholding amount can be trusted until the real IRS Publication 15-T tables are transcribed.`,
      };
    }
    return { usable: true };
  } catch {
    return {
      usable: false,
      reason: 'missing',
      message:
        `There are no tax tables for ${year}. ` +
        `No withholding amount can be trusted until the real IRS tables are transcribed.`,
    };
  }
}

export type EmployeeTaxFields = {
  tax_classification: TaxClassification | null;
  w4_filing_status: FilingStatus | null;
  w4_multiple_jobs: boolean | null;
  w4_dependents_amount: number | null;
  w4_other_income: number | null;
  w4_deductions: number | null;
  w4_extra_withholding: number | null;
  w4_exempt: boolean | null;
};

export type EmployeeTaxForm = {
  classification: string; // '' = unclassified
  filingStatus: string;
  multipleJobs: boolean;
  dependentsAmount: string;
  otherIncome: string;
  deductions: string;
  extraWithholding: string;
  exempt: boolean;
};

const STATUSES: FilingStatus[] = ['single', 'married_jointly', 'head_of_household'];

/** Blank is "not answered" (null); a typed 0 is an answer. Junk and negatives are rejected. */
function money(s: string): number | null | 'invalid' {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
}

/**
 * Form state to the row's columns. W-4 fields are written only for a W-2
 * employee; for anyone else they are cleared, so a person switched to 1099
 * does not keep a stale W-4 that would look like an answer.
 */
export function employeeTaxFieldsFromForm(
  f: EmployeeTaxForm,
): { ok: true; fields: EmployeeTaxFields } | { ok: false; error: string } {
  const empty: EmployeeTaxFields = {
    tax_classification: null,
    w4_filing_status: null,
    w4_multiple_jobs: null,
    w4_dependents_amount: null,
    w4_other_income: null,
    w4_deductions: null,
    w4_extra_withholding: null,
    w4_exempt: null,
  };
  if (f.classification === 'contractor_1099') {
    return { ok: true, fields: { ...empty, tax_classification: 'contractor_1099' } };
  }
  if (f.classification !== 'w2') return { ok: true, fields: empty };

  const dep = money(f.dependentsAmount);
  const other = money(f.otherIncome);
  const ded = money(f.deductions);
  const extra = money(f.extraWithholding);
  if ([dep, other, ded, extra].includes('invalid')) {
    return { ok: false, error: 'W-4 amounts must be numbers of zero or more' };
  }
  return {
    ok: true,
    fields: {
      tax_classification: 'w2',
      w4_filing_status: STATUSES.includes(f.filingStatus as FilingStatus)
        ? (f.filingStatus as FilingStatus)
        : null,
      w4_multiple_jobs: f.multipleJobs,
      w4_dependents_amount: dep as number | null,
      w4_other_income: other as number | null,
      w4_deductions: ded as number | null,
      w4_extra_withholding: extra as number | null,
      w4_exempt: f.exempt,
    },
  };
}
