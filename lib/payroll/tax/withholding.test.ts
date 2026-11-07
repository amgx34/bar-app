// lib/payroll/tax/withholding.test.ts
import { describe, it, expect } from 'vitest';
import { computeWithholding } from './withholding';
import { TABLES_2026 } from './tables/2026';
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
  tipsPaidOnCheque: false,
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
    // `run()` has ytd 0, so there is no Additional Medicare here and the whole
    // Medicare shortfall belongs to the plain field. Asserted rather than
    // assumed: if it were non-zero the next line would be checking the wrong
    // figure against the wrong one and still passing.
    expect(full.additionalMedicare).toBe(0);
    const r = run({ availableToWithhold: full.socialSecurity / 2 });
    expect(r.socialSecurity).toBeCloseTo(full.socialSecurity / 2, 6);
    expect(r.medicare).toBe(0);
    expect(r.uncollected.socialSecurity).toBeCloseTo(full.socialSecurity / 2, 6);
    expect(r.uncollected.medicare).toBeCloseTo(full.medicare, 6);
    expect(r.uncollected.additionalMedicare).toBe(0);
  });

  it('keeps additional Medicare on its own line, after plain Medicare', () => {
    // ytd just under the threshold so this period crosses it. Derived from the
    // table, not typed in, so it keeps crossing it if the threshold ever moves.
    const ytd = TABLES_2026.fica.additionalMedicareThreshold - 1000;
    const full = run({ ytdWages: ytd, grossForPeriod: 5000, availableToWithhold: 5000 });
    expect(full.additionalMedicare).toBeGreaterThan(0);
    const r = run({
      ytdWages: ytd, grossForPeriod: 5000,
      availableToWithhold: full.socialSecurity + full.medicare + full.additionalMedicare / 2,
    });
    expect(r.medicare).toBeCloseTo(full.medicare, 6);
    expect(r.additionalMedicare).toBeCloseTo(full.additionalMedicare / 2, 6);
  });

  // Social Security and Additional Medicare cannot both be non-zero in one case:
  // the wage base sits below the Additional Medicare threshold, so anyone far
  // enough into the year to owe the latter has already passed the former. Two
  // cases, each deriving its ytd from the tables so it keeps meaning what it
  // says when the placeholder figures are replaced.
  const T = TABLES_2026.fica;
  const sum = (r: ReturnType<typeof run>) =>
    r.socialSecurity + r.medicare + r.additionalMedicare + r.federalIncome + r.state;
  const uncollectedSum = (r: ReturnType<typeof run>) =>
    r.uncollected.socialSecurity + r.uncollected.medicare +
    r.uncollected.additionalMedicare +
    r.uncollected.federalIncome + r.uncollected.state;

  it('splits a shortfall across SS, Medicare, federal and state (ytd 0, SS non-zero)', () => {
    const full = run({ ytdWages: 0 });
    expect(full.socialSecurity).toBeGreaterThan(0);
    expect(full.additionalMedicare).toBe(0);
    const ficaOwed = full.socialSecurity + full.medicare;

    // Runs out half-way through federal: FICA whole, state untouched.
    const r = run({ ytdWages: 0, availableToWithhold: ficaOwed + full.federalIncome / 2 });
    expect(r.socialSecurity).toBeCloseTo(full.socialSecurity, 6);
    expect(r.medicare).toBeCloseTo(full.medicare, 6);
    expect(r.federalIncome).toBeCloseTo(full.federalIncome / 2, 6);
    expect(r.state).toBe(0);
    expect(r.uncollected.socialSecurity).toBeCloseTo(0, 6);
    expect(r.uncollected.medicare).toBeCloseTo(0, 6);
    expect(r.uncollected.federalIncome).toBeCloseTo(full.federalIncome / 2, 6);
    expect(r.uncollected.state).toBeCloseTo(full.state, 6);
    expect(r.total).toBeCloseTo(sum(r), 6);
    expect(r.uncollected.total).toBeCloseTo(uncollectedSum(r), 6);

    // Runs out half-way through Medicare: SS whole, everything after it short.
    const m = run({ ytdWages: 0, availableToWithhold: full.socialSecurity + full.medicare / 2 });
    expect(m.socialSecurity).toBeCloseTo(full.socialSecurity, 6);
    expect(m.medicare).toBeCloseTo(full.medicare / 2, 6);
    expect(m.federalIncome).toBe(0);
    expect(m.state).toBe(0);
    expect(m.uncollected.socialSecurity).toBeCloseTo(0, 6);
    expect(m.uncollected.medicare).toBeCloseTo(full.medicare / 2, 6);
    expect(m.uncollected.additionalMedicare).toBe(0);
    expect(m.uncollected.federalIncome).toBeCloseTo(full.federalIncome, 6);
    expect(m.uncollected.state).toBeCloseTo(full.state, 6);
    expect(m.total).toBeCloseTo(sum(m), 6);
  });

  it('counts state in total when state is actually taken', () => {
    const full = run();
    expect(full.state).toBeGreaterThan(0);
    const available = full.total - full.state / 2;
    const r = run({ availableToWithhold: available });
    expect(r.state).toBeCloseTo(full.state / 2, 6);
    expect(r.federalIncome).toBeCloseTo(full.federalIncome, 6);
    expect(r.total).toBeCloseTo(available, 6);
    expect(r.total).toBeCloseTo(sum(r), 6);
    expect(r.uncollected.state).toBeCloseTo(full.state / 2, 6);
    expect(r.uncollected.total).toBeCloseTo(full.state / 2, 6);
  });

  it('splits a shortfall when Additional Medicare is non-zero (ytd past the threshold, SS spent)', () => {
    const ytdWages = T.additionalMedicareThreshold - 1000;
    const base = { ytdWages, grossForPeriod: 5000 };
    const full = run({ ...base, availableToWithhold: 5000 });
    // Guard the premise: if the tables change so this stops being true the
    // test must fail loudly instead of passing on zeros.
    expect(ytdWages).toBeGreaterThanOrEqual(T.socialSecurityWageBase);
    expect(full.socialSecurity).toBe(0);
    expect(full.additionalMedicare).toBeGreaterThan(0);
    expect(full.federalIncome).toBeGreaterThan(0);
    expect(full.state).toBeGreaterThan(0);

    const r = run({
      ...base,
      availableToWithhold: full.medicare + full.additionalMedicare + full.federalIncome / 2,
    });
    expect(r.medicare).toBeCloseTo(full.medicare, 6);
    expect(r.additionalMedicare).toBeCloseTo(full.additionalMedicare, 6);
    expect(r.federalIncome).toBeCloseTo(full.federalIncome / 2, 6);
    expect(r.state).toBe(0);
    expect(r.uncollected.medicare).toBeCloseTo(0, 6);
    expect(r.uncollected.additionalMedicare).toBeCloseTo(0, 6);
    expect(r.uncollected.federalIncome).toBeCloseTo(full.federalIncome / 2, 6);
    expect(r.uncollected.state).toBeCloseTo(full.state, 6);
    expect(r.total).toBeCloseTo(sum(r), 6);

    // Short inside Medicare: plain Medicare first, Additional takes the rest.
    const m = run({ ...base, availableToWithhold: full.medicare + full.additionalMedicare / 2 });
    expect(m.medicare).toBeCloseTo(full.medicare, 6);
    expect(m.additionalMedicare).toBeCloseTo(full.additionalMedicare / 2, 6);
    expect(m.federalIncome).toBe(0);
  });

  it('attributes a Medicare shortfall to plain and Additional Medicare separately', () => {
    // The two are one step of the shortfall ordering but two taxes: Additional
    // Medicare is employee-only and reported on its own line (Form 8959), so a
    // shortfall folded into `uncollected.medicare` is filed against the wrong
    // tax. These cases fail an implementation that reports the combined figure
    // in `medicare` and leaves `additionalMedicare` at zero, and one that
    // satisfies Additional Medicare before plain Medicare.
    const ytdWages = T.additionalMedicareThreshold - 1000;
    const base = { ytdWages, grossForPeriod: 5000 };
    const full = run({ ...base, availableToWithhold: 5000 });
    // Premises. Both components must be non-zero or the split is untested, and
    // SS must be spent or it would absorb the money before Medicare sees it.
    expect(ytdWages).toBeGreaterThanOrEqual(T.socialSecurityWageBase);
    expect(full.socialSecurity).toBe(0);
    expect(full.medicare).toBeGreaterThan(0);
    expect(full.additionalMedicare).toBeGreaterThan(0);

    // (a) Short inside PLAIN Medicare. Additional Medicare is then wholly
    // uncollected, and plain Medicare is short by only its own half — a folded
    // implementation would put `full.medicare / 2 + full.additionalMedicare`
    // in `uncollected.medicare`.
    const a = run({ ...base, availableToWithhold: full.medicare / 2 });
    expect(a.medicare).toBeCloseTo(full.medicare / 2, 6);
    expect(a.additionalMedicare).toBe(0);
    expect(a.uncollected.medicare).toBeCloseTo(full.medicare / 2, 6);
    expect(a.uncollected.additionalMedicare).toBeCloseTo(full.additionalMedicare, 6);

    // (b) Short inside ADDITIONAL Medicare, plain Medicare satisfied. The
    // shortfall belongs entirely to the Additional line; an implementation that
    // ordered Additional first would report it against plain Medicare instead.
    const b = run({
      ...base,
      availableToWithhold: full.medicare + full.additionalMedicare / 2,
    });
    expect(b.uncollected.medicare).toBeCloseTo(0, 6);
    expect(b.uncollected.additionalMedicare).toBeCloseTo(full.additionalMedicare / 2, 6);

    // Conservation on both sides, per tax and in total: nothing is lost or
    // double-counted by the split. (Plain and Additional cannot BOTH be
    // strictly partial — the step pays plain in full before Additional gets
    // anything — so case (a) is the closest reachable state, with both
    // uncollected fields non-zero.)
    for (const r of [a, b]) {
      expect(r.medicare + r.uncollected.medicare).toBeCloseTo(full.medicare, 6);
      expect(r.additionalMedicare + r.uncollected.additionalMedicare)
        .toBeCloseTo(full.additionalMedicare, 6);
      expect(r.uncollected.total).toBeCloseTo(uncollectedSum(r), 6);
      expect(r.total + r.uncollected.total).toBeCloseTo(full.total + full.uncollected.total, 6);
    }
    expect(a.uncollected.medicare).toBeGreaterThan(0);
    expect(a.uncollected.additionalMedicare).toBeGreaterThan(0);
  });

  it('records what could not be taken, per tax', () => {
    const full = run();
    const r = run({ availableToWithhold: 0 });

    expect(r.uncollected.federalIncome).toBeCloseTo(full.federalIncome, 2);
    expect(r.uncollected.socialSecurity).toBeCloseTo(full.socialSecurity, 2);
    expect(r.uncollected.medicare).toBeCloseTo(full.medicare, 2);
    expect(r.uncollected.additionalMedicare).toBeCloseTo(full.additionalMedicare, 2);
    expect(r.uncollected.state).toBeCloseTo(full.state, 2);
    // Every component is uncollected here, so the total must be their sum: an
    // implementation that dropped one of the five from `total` fails this.
    expect(r.uncollected.total).toBeCloseTo(uncollectedSum(r), 6);
    expect(r.uncollected.total).toBeCloseTo(full.total, 2);
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
