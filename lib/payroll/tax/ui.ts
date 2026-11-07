// lib/payroll/tax/ui.ts
import { tablesFor } from './tables';
import type { FilingStatus, OrgTaxConfig, PayFrequency, TaxClassification } from './types';

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

const FIELD_LABELS = {
  dependentsAmount: 'Dependents amount',
  otherIncome: 'Other income',
  deductions: 'Deductions',
  extraWithholding: 'Extra withholding',
} as const;

/** Blank is "not answered" (null); a typed 0 is an answer. Junk and negatives are rejected. */
function money(s: unknown): number | null | 'invalid' {
  if (typeof s !== 'string') return 'invalid';
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
}

/**
 * Form state to the row's columns. THE one validator: the dialog runs it for
 * instant feedback and the server action runs it again, because a server
 * action is a public endpoint. Its output is exactly the eight columns, which
 * is the allowlist the action writes, so nothing else can reach .update().
 *
 * Rejects rather than coerces, naming the field. W-4 fields are written only
 * for a W-2 employee; for anyone else they are cleared, so a person switched
 * to 1099 does not keep a stale W-4 that would look like an answer.
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
  if (typeof f !== 'object' || f === null) return { ok: false, error: 'Tax details are missing' };
  const cls = f.classification;
  if (typeof cls !== 'string') return { ok: false, error: 'Tax classification is invalid' };
  if (cls === '' || cls === 'unclassified') return { ok: true, fields: empty };
  if (cls === 'contractor_1099') {
    return { ok: true, fields: { ...empty, tax_classification: 'contractor_1099' } };
  }
  if (cls !== 'w2') return { ok: false, error: 'Tax classification is invalid' };

  if (typeof f.filingStatus !== 'string' || (f.filingStatus !== '' && !STATUSES.includes(f.filingStatus as FilingStatus))) {
    return { ok: false, error: 'Filing status is invalid' };
  }
  if (typeof f.multipleJobs !== 'boolean') return { ok: false, error: 'Multiple jobs must be true or false' };
  if (typeof f.exempt !== 'boolean') return { ok: false, error: 'Exempt must be true or false' };

  const out: Record<keyof typeof FIELD_LABELS, number | null> = {
    dependentsAmount: null, otherIncome: null, deductions: null, extraWithholding: null,
  };
  for (const key of Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]) {
    const v = money(f[key]);
    if (v === 'invalid') {
      return { ok: false, error: `${FIELD_LABELS[key]} must be a number of zero or more` };
    }
    out[key] = v;
  }
  return {
    ok: true,
    fields: {
      tax_classification: 'w2',
      w4_filing_status: f.filingStatus === '' ? null : (f.filingStatus as FilingStatus),
      w4_multiple_jobs: f.multipleJobs,
      w4_dependents_amount: out.dependentsAmount,
      w4_other_income: out.otherIncome,
      w4_deductions: out.deductions,
      w4_extra_withholding: out.extraWithholding,
      w4_exempt: f.exempt,
    },
  };
}

const FREQS: PayFrequency[] = ['weekly', 'biweekly', 'semimonthly', 'monthly'];

/**
 * Server-side gate for an org tax patch. Returns an error sentence or null.
 * Enabling tax on unusable tables, or before a pay frequency has been chosen,
 * is refused here, not only in the panel, because the action is callable directly.
 */
export function orgTaxPatchError(
  patch: Partial<OrgTaxConfig>,
  year: number,
  /** Does the STORED setting already hold a deliberate pay frequency? */
  frequencyAlreadyChosen: boolean,
): string | null {
  if (typeof patch !== 'object' || patch === null) return 'Invalid tax settings';
  if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') return 'Enabled must be true or false';
  if (patch.stateEnabled !== undefined && typeof patch.stateEnabled !== 'boolean') return 'State withholding must be true or false';
  if (patch.tipsPaidOnCheque !== undefined && typeof patch.tipsPaidOnCheque !== 'boolean') return 'Tips paid on cheque must be true or false';
  if (patch.payFrequency !== undefined && !FREQS.includes(patch.payFrequency)) return 'Invalid pay frequency';
  if (
    patch.stateRate !== undefined &&
    !(typeof patch.stateRate === 'number' && Number.isFinite(patch.stateRate) && patch.stateRate >= 0 && patch.stateRate <= 100)
  ) {
    return 'State rate must be between 0 and 100';
  }
  if (patch.enabled === true) {
    // Withholding annualises by pay frequency. An unanswered question must not
    // become a number: weekly pay read as biweekly halves the annualised wage.
    // The patch itself may carry the answer (validated above).
    if (patch.payFrequency === undefined && !frequencyAlreadyChosen) {
      return 'Cannot switch withholding on. Choose how often you pay first: withholding is annualised from it.';
    }
    const t = tablesStatus(year);
    if (!t.usable) return `Cannot switch withholding on. ${t.message}`;
  }
  return null;
}

/**
 * How much of a person's pay tax can actually be taken from.
 *
 * Tips paid on the cheque are the employer's to withhold against, so all pay is
 * available. Tips cashed out nightly are already in the employee's pocket, so
 * only wages are. This decides how much of somebody's pay is reachable by tax,
 * which is why it is a tested function and not a ternary in a page.
 */
export function availableToWithholdFor(
  entry: { totalCompensation: number; regularPay: number; overtimePay: number },
  config: Pick<OrgTaxConfig, 'tipsPaidOnCheque'>,
): number {
  return config.tipsPaidOnCheque
    ? entry.totalCompensation
    : entry.regularPay + entry.overtimePay;
}
