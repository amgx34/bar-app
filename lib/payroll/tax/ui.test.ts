import { describe, it, expect } from 'vitest';
import { tablesStatus, employeeTaxFieldsFromForm, type EmployeeTaxForm } from './ui';

const form = (o: Partial<EmployeeTaxForm> = {}): EmployeeTaxForm => ({
  classification: 'w2', filingStatus: 'single', multipleJobs: false,
  dependentsAmount: '', otherIncome: '', deductions: '', extraWithholding: '', exempt: false, ...o,
});

describe('tablesStatus', () => {
  it('does not throw for a year with no tables, and says so', () => {
    const s = tablesStatus(1999);
    expect(s.usable).toBe(false);
    if (!s.usable) expect(s.reason).toBe('missing');
  });
  it('reports a placeholder year as unusable', () => {
    const s = tablesStatus(2026);
    if (!s.usable) expect(['placeholder', 'missing']).toContain(s.reason);
  });
});

describe('employeeTaxFieldsFromForm', () => {
  it('unclassified writes all nulls', () => {
    const r = employeeTaxFieldsFromForm(form({ classification: '' }));
    expect(r.ok && r.fields.tax_classification).toBeNull();
  });
  it('1099 clears W-4 fields', () => {
    const r = employeeTaxFieldsFromForm(form({ classification: 'contractor_1099', exempt: true, deductions: '5' }));
    expect(r.ok && r.fields).toMatchObject({ tax_classification: 'contractor_1099', w4_exempt: null, w4_deductions: null });
  });
  it('keeps a typed zero distinct from blank', () => {
    const r = employeeTaxFieldsFromForm(form({ deductions: '0' }));
    expect(r.ok && r.fields.w4_deductions).toBe(0);
    expect(r.ok && r.fields.w4_other_income).toBeNull();
  });
  it('rejects negatives and junk', () => {
    expect(employeeTaxFieldsFromForm(form({ deductions: '-1' })).ok).toBe(false);
    expect(employeeTaxFieldsFromForm(form({ extraWithholding: 'abc' })).ok).toBe(false);
  });
});
