// lib/payroll/tax/withholding.test.ts
import { describe, it, expect } from 'vitest';
import { computeWithholding } from './withholding';
import type { EmployeeTaxProfile, OrgTaxConfig } from './types';

const W2: EmployeeTaxProfile = {
  classification: 'w2',
  filingStatus: 'single',
  multipleJobs: false,
  dependentsAmount: 0,
  otherIncome: 0,
  deductions: 0,
  extraWithholding: 0,
  exempt: false,
};

const CONFIG: OrgTaxConfig = {
  enabled: true,
  payFrequency: 'biweekly',
  stateEnabled: true,
  stateRate: 5,
};

const run = (over: Partial<Parameters<typeof computeWithholding>[0]> = {}) =>
  computeWithholding({
    grossForPeriod: 2000,
    availableToWithhold: 2000,
    ytdWages: 0,
    profile: W2,
    config: CONFIG,
    taxYear: 2026,
    ...over,
  });

describe('status', () => {
  it('withholds for a W-2 employee', () => {
    expect(run().status).toBe('withheld');
  });

  it('withholds nothing for a contractor and says so', () => {
    const r = run({ profile: { ...W2, classification: 'contractor_1099' } });
    expect(r.status).toBe('not_taxed');
    expect(r.total).toBe(0);
  });

  it('treats an unclassified employee as a question, not a contractor', () => {
    // Same zero, different meaning. The review screen must be able to tell a
    // decision from an unanswered question.
    const r = run({ profile: { ...W2, classification: null } });
    expect(r.status).toBe('unclassified');
    expect(r.total).toBe(0);
  });

  it('exempt withholds no federal income but still withholds FICA', () => {
    const r = run({ profile: { ...W2, exempt: true } });
    expect(r.status).toBe('exempt');
    expect(r.federalIncome).toBe(0);
    expect(r.socialSecurity).toBeGreaterThan(0);
  });

  it('withholds nothing at all when tax is disabled for the org', () => {
    const r = run({ config: { ...CONFIG, enabled: false } });
    // Not 'not_taxed': that means "contractor", and a bar that has not turned
    // tax on does not employ only contractors.
    expect(r.status).toBe('disabled');
    expect(r.total).toBe(0);
  });
});

describe('W-4 fields not yet entered', () => {
  it('computes as single with no adjustments rather than throwing', () => {
    // Review Focus 2. Classified W-2 this morning, form not typed in yet.
    const r = run({
      profile: {
        classification: 'w2', filingStatus: null, multipleJobs: null,
        dependentsAmount: null, otherIncome: null, deductions: null,
        extraWithholding: null, exempt: null,
      },
    });
    expect(r.status).toBe('withheld');
    expect(Number.isFinite(r.total)).toBe(true);
    expect(r.total).toBeGreaterThan(0);
  });
});

describe('degenerate gross', () => {
  it('withholds nothing on zero gross', () => {
    // Review Focus 1.
    const r = run({ grossForPeriod: 0, availableToWithhold: 0 });
    expect(r.total).toBe(0);
    expect(r.uncollected.total).toBe(0);
  });

  it('never returns a negative component on negative gross', () => {
    // Review Focus 1. A correction period must not invent a refund.
    const r = run({ grossForPeriod: -500, availableToWithhold: 0 });
    expect(r.total).toBe(0);
    expect(r.federalIncome).toBe(0);
    expect(r.socialSecurity).toBe(0);
  });
});

describe('state', () => {
  it('is a flat percentage of gross', () => {
    expect(run().state).toBeCloseTo(2000 * 0.05, 2);
  });

  it('is zero when state withholding is off', () => {
    expect(run({ config: { ...CONFIG, stateEnabled: false } }).state).toBe(0);
  });
});

describe('shortfall', () => {
  it('never withholds more than is available', () => {
    const full = run();
    const r = run({ availableToWithhold: 50 });
    // Conservation: nothing is lost or invented. An implementation that
    // withheld nothing would fail the first line; one that took more than 50
    // would fail the second.
    expect(r.total).toBeCloseTo(50, 6);
    expect(r.total + r.uncollected.total).toBeCloseTo(full.total, 6);
  });

  it('takes FICA before federal income before state', () => {
    // The order is specified, not incidental: the W-2 boxes these feed differ,
    // so which tax went short has to be a decision rather than an accident.
    const full = run();
    const ficaOwed = full.socialSecurity + full.medicare + full.additionalMedicare;
    // Enough for FICA and half of federal: state must get nothing, federal the
    // remainder, FICA in full. Any other order shorts FICA or feeds state.
    const r = run({ availableToWithhold: ficaOwed + full.federalIncome / 2 });

    expect(full.federalIncome).toBeGreaterThan(0);
    expect(full.state).toBeGreaterThan(0);
    expect(r.socialSecurity).toBeCloseTo(full.socialSecurity, 6);
    expect(r.medicare).toBeCloseTo(full.medicare, 6);
    expect(r.federalIncome).toBeCloseTo(full.federalIncome / 2, 6);
    expect(r.state).toBe(0);
    expect(r.uncollected.federalIncome).toBeCloseTo(full.federalIncome / 2, 6);
    expect(r.uncollected.state).toBeCloseTo(full.state, 6);
  });

  it('takes federal income before state when FICA is fully covered', () => {
    const full = run();
    const ficaOwed = full.socialSecurity + full.medicare + full.additionalMedicare;
    const r = run({ availableToWithhold: ficaOwed + full.federalIncome + full.state / 2 });
    expect(r.federalIncome).toBeCloseTo(full.federalIncome, 6);
    expect(r.state).toBeCloseTo(full.state / 2, 6);
  });

  it('takes Social Security before Medicare', () => {
    const full = run();
    const r = run({ availableToWithhold: full.socialSecurity / 2 });
    expect(r.socialSecurity).toBeCloseTo(full.socialSecurity / 2, 6);
    expect(r.medicare).toBe(0);
    expect(r.uncollected.medicare).toBeCloseTo(full.medicare, 6);
  });

  it('keeps additional Medicare on its own line, after plain Medicare', () => {
    // ytd just under the threshold so this period crosses it.
    const full = run({ ytdWages: 199_000, grossForPeriod: 5000, availableToWithhold: 5000 });
    expect(full.additionalMedicare).toBeGreaterThan(0);
    const r = run({
      ytdWages: 199_000, grossForPeriod: 5000,
      availableToWithhold: full.socialSecurity + full.medicare + full.additionalMedicare / 2,
    });
    expect(r.medicare).toBeCloseTo(full.medicare, 6);
    expect(r.additionalMedicare).toBeCloseTo(full.additionalMedicare / 2, 6);
  });

  it('records what could not be taken, per tax', () => {
    const full = run();
    const r = run({ availableToWithhold: 0 });

    expect(r.uncollected.federalIncome).toBeCloseTo(full.federalIncome, 2);
    expect(r.uncollected.socialSecurity).toBeCloseTo(full.socialSecurity, 2);
    expect(r.uncollected.state).toBeCloseTo(full.state, 2);
    expect(r.uncollected.total).toBeGreaterThan(0);
  });

  it('records nothing uncollected when everything was taken', () => {
    expect(run().uncollected.total).toBeCloseTo(0, 2);
  });
});

describe('unknown tax year', () => {
  it('throws rather than computing from another year', () => {
    expect(() => run({ taxYear: 2099 })).toThrow(/2099/);
  });
});

describe('zero pay with a flat extra withholding', () => {
  it('does not withhold the Step 4(c) amount from a period with no gross', () => {
    const r = run({
      grossForPeriod: 0, availableToWithhold: 500,
      profile: { ...W2, extraWithholding: 50 },
    });
    expect(r.total).toBe(0);
    expect(r.federalIncome).toBe(0);
  });

  it('keeps the exempt status on a zero-gross period', () => {
    const r = run({ grossForPeriod: 0, availableToWithhold: 0, profile: { ...W2, exempt: true } });
    expect(r.status).toBe('exempt');
  });
});
