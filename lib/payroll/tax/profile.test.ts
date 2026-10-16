// lib/payroll/tax/profile.test.ts
import { describe, it, expect } from 'vitest';
import { taxProfileFromEmployee } from './profile';

describe('taxProfileFromEmployee', () => {
  // Catches: any field dropped, renamed, or mapped to the wrong column.
  it('reads a fully filled row', () => {
    expect(taxProfileFromEmployee({
      tax_classification: 'w2',
      w4_filing_status: 'married_jointly',
      w4_multiple_jobs: true,
      w4_dependents_amount: 2000,
      w4_other_income: 100,
      w4_deductions: 50,
      w4_extra_withholding: 25,
      w4_exempt: false,
    })).toEqual({
      classification: 'w2',
      filingStatus: 'married_jointly',
      multipleJobs: true,
      dependentsAmount: 2000,
      otherIncome: 100,
      deductions: 50,
      extraWithholding: 25,
      exempt: false,
    });
  });

  // Catches: defaulting an empty row to 'w2' (silent withholding) or to
  // 'contractor_1099' (silent decision), or numerics/booleans to 0/false.
  it('reads an empty row as entirely unanswered', () => {
    expect(taxProfileFromEmployee({})).toEqual({
      classification: null, filingStatus: null, multipleJobs: null,
      dependentsAmount: null, otherIncome: null, deductions: null,
      extraWithholding: null, exempt: null,
    });
  });

  // Catches: collapsing NULL into contractor_1099 (or the reverse).
  it('keeps unclassified distinct from contractor_1099', () => {
    expect(taxProfileFromEmployee({ tax_classification: null }).classification).toBeNull();
    expect(taxProfileFromEmployee({ tax_classification: 'contractor_1099' }).classification)
      .toBe('contractor_1099');
  });

  // Catches: Number() missing, so the string passes through.
  it('reads numerics that arrive as strings from postgres', () => {
    expect(taxProfileFromEmployee({ w4_dependents_amount: '2000.00' }).dependentsAmount).toBe(2000);
  });

  // Catches: `|| null` style coercion, which would turn a real zero into
  // "unanswered".
  it('reads a zero numeric as 0, not as unanswered', () => {
    expect(taxProfileFromEmployee({ w4_extra_withholding: '0.00' }).extraWithholding).toBe(0);
  });

  // Catches: Number('') === 0 and NaN / junk leaking through as an amount.
  it('reads an empty or garbage numeric as null', () => {
    expect(taxProfileFromEmployee({ w4_other_income: '' }).otherIncome).toBeNull();
    expect(taxProfileFromEmployee({ w4_other_income: 'abc' }).otherIncome).toBeNull();
    expect(taxProfileFromEmployee({ w4_other_income: NaN }).otherIncome).toBeNull();
  });

  // Catches: trusting classification through (would return 'w4').
  it('rejects an unrecognised classification rather than trusting it', () => {
    expect(taxProfileFromEmployee({ tax_classification: 'w4' }).classification).toBeNull();
  });

  // Catches: trusting filing status through, picking a bracket table from a typo.
  it('rejects an unrecognised filing status rather than trusting it', () => {
    expect(taxProfileFromEmployee({ w4_filing_status: 'married' }).filingStatus).toBeNull();
  });

  // Catches: truthiness coercion ('false' is truthy; 1 would exempt someone).
  it('only reads real booleans', () => {
    const p = taxProfileFromEmployee({ w4_exempt: 'false', w4_multiple_jobs: 1 });
    expect(p.exempt).toBeNull();
    expect(p.multipleJobs).toBeNull();
  });
});
