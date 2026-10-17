import { describe, it, expect, vi, beforeEach } from 'vitest';

let impl: (y: number) => unknown = () => ({ placeholder: false });
const tablesFor = {
  mockReturnValue: (v: unknown) => { impl = () => v; },
  mockImplementation: (f: (y: number) => unknown) => { impl = f; },
  mockReset: () => { impl = () => ({ placeholder: false }); },
};
vi.mock('./tables', () => ({ tablesFor: (y: number) => impl(y) }));

import { tablesStatus, availableToWithholdFor, employeeTaxFieldsFromForm, orgTaxPatchError, type EmployeeTaxForm } from './ui';

const form = (o: Partial<EmployeeTaxForm> = {}): EmployeeTaxForm => ({
  classification: 'w2', filingStatus: 'single', multipleJobs: false,
  dependentsAmount: '', otherIncome: '', deductions: '', extraWithholding: '', exempt: false, ...o,
});
const err = (o: Partial<EmployeeTaxForm>) => {
  const r = employeeTaxFieldsFromForm(form(o));
  if (r.ok) throw new Error('expected rejection');
  return r.error;
};

beforeEach(() => tablesFor.mockReset());

describe('tablesStatus', () => {
  it('real tables are usable (catches an implementation that always refuses)', () => {
    tablesFor.mockReturnValue({ placeholder: false });
    expect(tablesStatus(2026)).toEqual({ usable: true });
  });
  it('placeholder tables are refused with reason placeholder and a message naming the year', () => {
    tablesFor.mockReturnValue({ placeholder: true });
    expect(tablesStatus(2026)).toMatchObject({ usable: false, reason: 'placeholder' });
    expect((tablesStatus(2026) as { message: string }).message).toContain('2026');
    expect((tablesStatus(2026) as { message: string }).message).toContain('placeholders');
  });
  it('a throw becomes reason missing, not a crash (catches a removed try/catch)', () => {
    tablesFor.mockImplementation(() => { throw new Error('No payroll tax tables'); });
    expect(tablesStatus(1999)).toMatchObject({ usable: false, reason: 'missing' });
    expect((tablesStatus(1999) as { message: string }).message).toContain('1999');
  });
});

describe('tablesStatus against the real 2026 tables', () => {
  it('2026 is a placeholder today', async () => {
    const real = await vi.importActual<typeof import('./tables')>('./tables');
    tablesFor.mockImplementation((y: number) => real.tablesFor(y));
    const s = tablesStatus(2026);
    expect(s).toMatchObject({ usable: false, reason: 'placeholder' });
  });
});

describe('employeeTaxFieldsFromForm', () => {
  it('W-2 happy path passes every field through (catches a dropped or swapped column)', () => {
    const r = employeeTaxFieldsFromForm(form({
      filingStatus: 'married_jointly', multipleJobs: true, exempt: true,
      dependentsAmount: '2000', otherIncome: '100.5', deductions: '300', extraWithholding: '25',
    }));
    expect(r).toEqual({ ok: true, fields: {
      tax_classification: 'w2', w4_filing_status: 'married_jointly', w4_multiple_jobs: true,
      w4_dependents_amount: 2000, w4_other_income: 100.5, w4_deductions: 300,
      w4_extra_withholding: 25, w4_exempt: true,
    } });
  });
  it('W-2 with blank amounts keeps them null, and a typed 0 stays 0', () => {
    const r = employeeTaxFieldsFromForm(form({ otherIncome: '0' }));
    expect(r.ok && r.fields.w4_other_income).toBe(0);
    expect(r.ok && r.fields.w4_deductions).toBeNull();
  });
  it('blank and the literal "unclassified" both write all eight columns null', () => {
    for (const classification of ['', 'unclassified']) {
      const r = employeeTaxFieldsFromForm(form({ classification, exempt: true, deductions: '5' }));
      expect(r).toEqual({ ok: true, fields: {
        tax_classification: null, w4_filing_status: null, w4_multiple_jobs: null,
        w4_dependents_amount: null, w4_other_income: null, w4_deductions: null,
        w4_extra_withholding: null, w4_exempt: null,
      } });
    }
  });
  it('1099 clears W-4 fields (catches stale W-4 surviving a reclassification)', () => {
    const r = employeeTaxFieldsFromForm(form({ classification: 'contractor_1099', exempt: true, deductions: '5' }));
    expect(r).toMatchObject({ ok: true, fields: { tax_classification: 'contractor_1099', w4_exempt: null, w4_deductions: null } });
  });
  it.each([
    ['dependentsAmount', 'Dependents amount'],
    ['otherIncome', 'Other income'],
    ['deductions', 'Deductions'],
    ['extraWithholding', 'Extra withholding'],
  ] as const)('rejects a negative %s and names it (a negative dependents amount raises tax withheld)', (key, label) => {
    expect(err({ [key]: '-1' })).toContain(label);
    expect(err({ [key]: 'abc' })).toContain(label);
  });
  it('rejects an unknown filing status instead of nulling it', () => {
    expect(err({ filingStatus: 'bogus' })).toContain('Filing status');
  });
  it('rejects an unknown classification instead of treating it as unclassified', () => {
    expect(err({ classification: 'owner_operator' })).toContain('classification');
  });
  it('rejects wrongly typed values from a hand-built request', () => {
    expect(employeeTaxFieldsFromForm({ ...form(), multipleJobs: 'yes' } as never).ok).toBe(false);
    expect(employeeTaxFieldsFromForm({ ...form(), deductions: 5 } as never).ok).toBe(false);
    expect(employeeTaxFieldsFromForm(null as never).ok).toBe(false);
  });
  it('output carries exactly the eight columns, ignoring extras (allowlist)', () => {
    const r = employeeTaxFieldsFromForm({ ...form(), organization_id: 'x', hourly_rate: 999 } as never);
    expect(r.ok && Object.keys(r.fields).sort()).toEqual([
      'tax_classification', 'w4_deductions', 'w4_dependents_amount', 'w4_exempt',
      'w4_extra_withholding', 'w4_filing_status', 'w4_multiple_jobs', 'w4_other_income',
    ]);
  });
});

describe('availableToWithholdFor', () => {
  const entry = { totalCompensation: 800, regularPay: 600, overtimePay: 50 };

  // Catches: ignoring the setting and always returning wages only.
  it('is total pay when tips are paid on the cheque', () => {
    expect(availableToWithholdFor(entry, { tipsPaidOnCheque: true })).toBe(800);
  });

  // Catches: ignoring the setting and always returning total pay; also dropping
  // overtime from the wage sum (650, not 600 or 800).
  it('is regular plus overtime when tips are cashed out', () => {
    expect(availableToWithholdFor(entry, { tipsPaidOnCheque: false })).toBe(650);
  });
});

describe('orgTaxPatchError', () => {
  // Catches: a validator that lets a truthy string through as the setting.
  it('rejects a non-boolean tipsPaidOnCheque and accepts a boolean', () => {
    tablesFor.mockReturnValue({ placeholder: false });
    expect(orgTaxPatchError({ tipsPaidOnCheque: 'yes' as never }, 2026)).not.toBeNull();
    expect(orgTaxPatchError({ tipsPaidOnCheque: 1 as never }, 2026)).not.toBeNull();
    expect(orgTaxPatchError({ tipsPaidOnCheque: true }, 2026)).toBeNull();
    expect(orgTaxPatchError({ tipsPaidOnCheque: false }, 2026)).toBeNull();
  });

  it('refuses enabling on placeholder tables (catches an action that trusts the UI)', () => {
    tablesFor.mockReturnValue({ placeholder: true });
    expect(orgTaxPatchError({ enabled: true }, 2026)).toContain('Cannot switch withholding on');
  });
  it('refuses enabling on a year with no tables', () => {
    tablesFor.mockImplementation(() => { throw new Error('none'); });
    expect(orgTaxPatchError({ enabled: true }, 2031)).toContain('Cannot switch withholding on');
  });
  it('allows enabling on real tables', () => {
    tablesFor.mockReturnValue({ placeholder: false });
    expect(orgTaxPatchError({ enabled: true }, 2026)).toBeNull();
  });
  it('always allows switching off, even on placeholder tables', () => {
    tablesFor.mockReturnValue({ placeholder: true });
    expect(orgTaxPatchError({ enabled: false }, 2026)).toBeNull();
  });
  it('rejects bad rate, frequency and non-boolean enabled', () => {
    tablesFor.mockReturnValue({ placeholder: false });
    expect(orgTaxPatchError({ stateRate: -1 }, 2026)).not.toBeNull();
    expect(orgTaxPatchError({ stateRate: 101 }, 2026)).not.toBeNull();
    expect(orgTaxPatchError({ stateRate: NaN }, 2026)).not.toBeNull();
    expect(orgTaxPatchError({ payFrequency: 'daily' as never }, 2026)).not.toBeNull();
    expect(orgTaxPatchError({ enabled: 'true' as never }, 2026)).not.toBeNull();
    expect(orgTaxPatchError({ stateRate: 5.5 }, 2026)).toBeNull();
  });
});
