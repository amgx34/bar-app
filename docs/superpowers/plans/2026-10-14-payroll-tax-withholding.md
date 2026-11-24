# Payroll Tax Withholding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute and display federal income tax, FICA and flat-rate state withholding for W-2 employees, without changing what anyone is actually paid.

**Architecture:** A pure engine in `lib/payroll/tax/` takes an existing `PayrollEntry` plus the employee's W-4 and the org's tax config and returns a `Withholding`. `computePayroll` is untouched. Tax tables are year-versioned TypeScript, selected by a year derived from the pay period's end date; a year with no table throws rather than falling back.

**Tech Stack:** TypeScript, Next.js 16 server components/actions, Supabase (Postgres), Vitest, Base UI (`@base-ui/react`).

**Spec:** `docs/superpowers/specs/2026-10-14-payroll-tax-withholding-design.md`

## Global Constraints

- All money is handled as `number` (dollars), matching `PayrollEntry`. Round only at the point of display or storage, never between engine steps.
- Every engine file under `lib/payroll/tax/` is **pure**: no imports from `@/lib/supabase/*`, no `async`, no `Date.now()`. The tax year and all inputs arrive as parameters.
- `tablesFor(year)` **throws** on an unknown year. It must never fall back to another year's table.
- No bracket figure may be written from memory. Task 2 is a transcription from the published IRS Publication 15-T.
- `components/ui` is Base UI, not Radix: no `asChild`, use `render` and controlled dialogs.
- Any writer of `organizations.bar_settings` must build from the latest read and return what it wrote (the `pos_config` clobber, AGENTS.md).
- Nothing in this plan changes `planBulkPayout`, `markPaid`, `markManyPaid`, `remainingAdvanceCapacity`, or `lib/payroll/nacha.ts`.
- Tests run with `npm test` (vitest). Typecheck with `npx tsc --noEmit`.

## Review Focus

Five input classes the spec implies that no task's happy path exercises. Each has its test added to the task that owns the code.

1. **Zero or negative gross** (a correction period, or an employee who worked no hours) must withhold zero, never a negative amount — Task 5.
2. **A W-2 employee with every W-4 field NULL** — newly classified, nobody has entered the form yet. Must compute as single with no adjustments rather than crash on a null — Task 5.
3. **A pay period crossing a year boundary** (2026-12-28 → 2027-01-03) resolves to the year of the END date, and throws if that year has no table — Task 1.
4. **`stateRate` hand-edited out of range** (negative, or above 100) must clamp, exactly as `barbackFractionFromSettings` already clamps a hand-edited `barback_tip_pct` — Task 6.
5. **An earner crossing the Social Security wage base and the Additional Medicare threshold inside one period** — partial SS withholding on the portion below the base, additional Medicare only on the portion above — Task 3.

---

### Task 1: Tax types and the year-versioned table registry

**Files:**
- Create: `lib/payroll/tax/types.ts`
- Create: `lib/payroll/tax/tables/index.ts`
- Test: `lib/payroll/tax/tables/index.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `FilingStatus`, `PayFrequency`, `TaxBracket`, `TaxTables`, `EmployeeTaxProfile`, `OrgTaxConfig`, `Withholding`, `periodsPerYear(freq)`, `taxYearForPeriod(endDate)`, `tablesFor(year)`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/payroll/tax/tables/index.test.ts
import { describe, it, expect } from 'vitest';
import { tablesFor, taxYearForPeriod, periodsPerYear } from './index';

describe('taxYearForPeriod', () => {
  it('uses the year the period ends in', () => {
    expect(taxYearForPeriod('2026-03-14')).toBe(2026);
  });

  it('resolves a period crossing new year to the later year', () => {
    // Review Focus 3. A period ending 3 January is taxed on the new year's
    // tables, so the first run of January is also the first run that proves
    // the new tables were transcribed.
    expect(taxYearForPeriod('2027-01-03')).toBe(2027);
  });
});

describe('periodsPerYear', () => {
  it('maps each supported frequency', () => {
    expect(periodsPerYear('weekly')).toBe(52);
    expect(periodsPerYear('biweekly')).toBe(26);
    expect(periodsPerYear('semimonthly')).toBe(24);
    expect(periodsPerYear('monthly')).toBe(12);
  });
});

describe('tablesFor', () => {
  it('returns the tables for a year it has', () => {
    expect(tablesFor(2026).year).toBe(2026);
  });

  it('throws for a year it does not have, rather than falling back', () => {
    // The whole risk of the percentage method: a stale table under-withholds
    // silently for twelve months. Failing loudly in January is the mitigation.
    expect(() => tablesFor(2099)).toThrow(/2099/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/payroll/tax/tables/index.test.ts`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Write the types**

```ts
// lib/payroll/tax/types.ts

/** The three statuses Pub 15-T's percentage-method tables are built around. */
export type FilingStatus = 'single' | 'married_jointly' | 'head_of_household';

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export type TaxClassification = 'w2' | 'contractor_1099';

/**
 * One row of a percentage-method table: tax is `base` plus `rate` of the amount
 * over `floor`. The top bracket has no ceiling.
 */
export type TaxBracket = {
  floor: number;
  base:  number;
  rate:  number;
};

/**
 * One year's federal figures. Two bracket sets per filing status: `standard`
 * for a W-4 with Step 2 unchecked, `step2` for one with it checked.
 */
export type TaxTables = {
  year: number;
  federal: {
    standard: Record<FilingStatus, TaxBracket[]>;
    step2:    Record<FilingStatus, TaxBracket[]>;
    /** Worksheet 1A line 1g, subtracted when Step 2 is NOT checked. */
    standardDeduction: Record<FilingStatus, number>;
  };
  fica: {
    socialSecurityRate:         number;
    socialSecurityWageBase:     number;
    medicareRate:               number;
    additionalMedicareRate:     number;
    additionalMedicareThreshold: number;
  };
};

/** A person's tax situation, read off the employees row. */
export type EmployeeTaxProfile = {
  classification: TaxClassification | null;
  filingStatus:   FilingStatus | null;
  multipleJobs:   boolean | null;
  dependentsAmount: number | null;
  otherIncome:    number | null;
  deductions:     number | null;
  extraWithholding: number | null;
  exempt:         boolean | null;
};

export type OrgTaxConfig = {
  enabled:      boolean;
  payFrequency: PayFrequency;
  stateEnabled: boolean;
  stateRate:    number;
};

export type WithholdingStatus =
  | 'withheld'
  | 'exempt'
  | 'not_taxed'
  | 'unclassified';

export type Withholding = {
  status: WithholdingStatus;
  federalIncome:      number;
  socialSecurity:     number;
  medicare:           number;
  additionalMedicare: number;
  state:              number;
  total:              number;
  uncollected: {
    federalIncome:  number;
    socialSecurity: number;
    medicare:       number;
    state:          number;
    total:          number;
  };
  notes: string[];
};
```

- [ ] **Step 4: Write the registry**

```ts
// lib/payroll/tax/tables/index.ts
import type { PayFrequency, TaxTables } from '../types';
import { TABLES_2026 } from './2026';

const BY_YEAR: Record<number, TaxTables> = {
  2026: TABLES_2026,
};

/**
 * Which year's tables a pay period is taxed under.
 *
 * The END date, so a period running 28 Dec to 3 Jan uses the new year. Derived
 * rather than configured on purpose: a stored year is a thing somebody forgets
 * to roll over, and the failure is silent under-withholding for twelve months.
 */
export function taxYearForPeriod(periodEndDate: string): number {
  return Number(periodEndDate.slice(0, 4));
}

export function periodsPerYear(freq: PayFrequency): number {
  switch (freq) {
    case 'weekly':      return 52;
    case 'biweekly':    return 26;
    case 'semimonthly': return 24;
    case 'monthly':     return 12;
  }
}

/**
 * Throws rather than falling back. A missing year means nobody transcribed the
 * new Pub 15-T, and computing anyway would under-withhold every paycheck for a
 * year without a single visible symptom.
 */
export function tablesFor(year: number): TaxTables {
  const tables = BY_YEAR[year];
  if (!tables) {
    throw new Error(
      `No payroll tax tables for ${year}. Transcribe IRS Publication 15-T for ` +
      `${year} into lib/payroll/tax/tables/${year}.ts and register it. ` +
      `Withholding is refused rather than computed from another year's figures.`,
    );
  }
  return tables;
}
```

- [ ] **Step 5: Run test to verify it fails for the right reason**

Run: `npx vitest run lib/payroll/tax/tables/index.test.ts`
Expected: FAIL — cannot resolve `./2026`. This is Task 2.

- [ ] **Step 6: Commit**

```bash
git add lib/payroll/tax/types.ts lib/payroll/tax/tables/index.ts lib/payroll/tax/tables/index.test.ts
git commit -m "feat(payroll): tax types and year-versioned table registry"
```

---

### Task 2: Transcribe the 2026 Publication 15-T tables

**Files:**
- Create: `lib/payroll/tax/tables/2026.ts`
- Test: `lib/payroll/tax/tables/2026.test.ts`

**Interfaces:**
- Consumes: `TaxTables`, `TaxBracket` from Task 1.
- Produces: `TABLES_2026: TaxTables`.

**This task is data entry against an external authoritative document, not code
authorship.** Every numeric literal below is transcribed from IRS Publication
15-T for 2026 — the annual percentage-method tables used by automated payroll
systems (Worksheet 1A), plus the year's Social Security wage base and
Additional Medicare threshold. Do not write these figures from memory or from
another year's file. Open the publication, transcribe, then let the tests below
check the result. The tests are what prove the transcription, which is why they
come first.

- [ ] **Step 1: Write the failing test**

```ts
// lib/payroll/tax/tables/2026.test.ts
import { describe, it, expect } from 'vitest';
import { TABLES_2026 } from './2026';
import type { FilingStatus, TaxBracket } from '../types';

const STATUSES: FilingStatus[] = ['single', 'married_jointly', 'head_of_household'];

function checkBrackets(name: string, brackets: TaxBracket[]) {
  it(`${name}: starts at zero`, () => {
    expect(brackets[0].floor).toBe(0);
  });

  it(`${name}: floors ascend`, () => {
    for (let i = 1; i < brackets.length; i++) {
      expect(brackets[i].floor).toBeGreaterThan(brackets[i - 1].floor);
    }
  });

  it(`${name}: rates ascend`, () => {
    for (let i = 1; i < brackets.length; i++) {
      expect(brackets[i].rate).toBeGreaterThan(brackets[i - 1].rate);
    }
  });

  it(`${name}: rates are fractions, not percents`, () => {
    for (const b of brackets) {
      expect(b.rate).toBeGreaterThanOrEqual(0);
      expect(b.rate).toBeLessThan(1);
    }
  });

  it(`${name}: the first bracket withholds nothing at zero income`, () => {
    expect(brackets[0].base).toBe(0);
  });

  it(`${name}: each base equals the tax accumulated up to that floor`, () => {
    // Catches the most likely transcription slip: a base copied from the wrong
    // row. Each bracket's base must equal the previous base plus the previous
    // rate applied across the previous band.
    for (let i = 1; i < brackets.length; i++) {
      const prev = brackets[i - 1];
      const expected = prev.base + prev.rate * (brackets[i].floor - prev.floor);
      expect(brackets[i].base).toBeCloseTo(expected, 2);
    }
  });
}

describe('2026 federal tables', () => {
  it('is labelled 2026', () => {
    expect(TABLES_2026.year).toBe(2026);
  });

  for (const status of STATUSES) {
    describe(`standard / ${status}`, () => {
      checkBrackets(status, TABLES_2026.federal.standard[status]);
    });
    describe(`step2 / ${status}`, () => {
      checkBrackets(status, TABLES_2026.federal.step2[status]);
    });
    it(`${status}: has a standard deduction amount`, () => {
      expect(TABLES_2026.federal.standardDeduction[status]).toBeGreaterThan(0);
    });
  }
});

describe('2026 FICA constants', () => {
  it('social security is 6.2% up to a wage base', () => {
    expect(TABLES_2026.fica.socialSecurityRate).toBeCloseTo(0.062, 5);
    expect(TABLES_2026.fica.socialSecurityWageBase).toBeGreaterThan(100_000);
  });

  it('medicare is 1.45% with an additional 0.9% above a threshold', () => {
    expect(TABLES_2026.fica.medicareRate).toBeCloseTo(0.0145, 5);
    expect(TABLES_2026.fica.additionalMedicareRate).toBeCloseTo(0.009, 5);
    expect(TABLES_2026.fica.additionalMedicareThreshold).toBe(200_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/payroll/tax/tables/2026.test.ts`
Expected: FAIL — cannot resolve `./2026`.

- [ ] **Step 3: Transcribe the tables**

Create `lib/payroll/tax/tables/2026.ts` with this exact structure. Replace every
`0` marked `TRANSCRIBE` with the figure from the publication. The structural
comments stay.

```ts
// lib/payroll/tax/tables/2026.ts
import type { TaxTables } from '../types';

/**
 * IRS Publication 15-T (2026), annual percentage method for automated payroll
 * systems — Worksheet 1A.
 *
 * Every figure here is transcribed from that document. None of it is derived,
 * inferred, or carried over from another year. When the 2027 publication lands,
 * copy this file to 2027.ts, transcribe afresh, and register it in ./index.ts —
 * do NOT edit this file, because an approved 2026 pay run must keep computing
 * the way it did when it was approved.
 */
export const TABLES_2026: TaxTables = {
  year: 2026,
  federal: {
    // Worksheet 1A Step 1, line 1g — subtracted when Step 2 is NOT checked.
    standardDeduction: {
      single:             0, // TRANSCRIBE
      married_jointly:    0, // TRANSCRIBE
      head_of_household:  0, // TRANSCRIBE
    },
    // "STANDARD Withholding Rate Schedules" — Step 2 checkbox NOT checked.
    standard: {
      single: [
        { floor: 0, base: 0, rate: 0 }, // TRANSCRIBE every row
      ],
      married_jointly: [
        { floor: 0, base: 0, rate: 0 }, // TRANSCRIBE every row
      ],
      head_of_household: [
        { floor: 0, base: 0, rate: 0 }, // TRANSCRIBE every row
      ],
    },
    // "Form W-4, Step 2, Checkbox, Withholding Rate Schedules".
    step2: {
      single: [
        { floor: 0, base: 0, rate: 0 }, // TRANSCRIBE every row
      ],
      married_jointly: [
        { floor: 0, base: 0, rate: 0 }, // TRANSCRIBE every row
      ],
      head_of_household: [
        { floor: 0, base: 0, rate: 0 }, // TRANSCRIBE every row
      ],
    },
  },
  fica: {
    socialSecurityRate:          0.062,
    socialSecurityWageBase:      0,       // TRANSCRIBE — changes every year
    medicareRate:                0.0145,
    additionalMedicareRate:      0.009,
    additionalMedicareThreshold: 200_000, // statutory, not indexed
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/payroll/tax/tables/`
Expected: PASS, including Task 1's `tablesFor(2026)` test.

If `each base equals the tax accumulated up to that floor` fails, a `base` or a
`floor` was copied from the wrong row. Re-check that bracket against the
publication; do not adjust the test to match the file.

- [ ] **Step 5: Verify against the publication's own worked example**

Add one test per filing status reproducing a worked example printed in
Publication 15-T, with the inputs and the published answer:

```ts
// append to lib/payroll/tax/tables/2026.test.ts
import { annualTaxFromBrackets } from '../federal';

describe('publication worked examples', () => {
  it('reproduces the published figure for a single filer', () => {
    // Inputs and expected result taken from the worked example in Pub 15-T.
    const adjustedAnnualWage = 0; // TRANSCRIBE from the example
    const published          = 0; // TRANSCRIBE the published answer
    expect(
      annualTaxFromBrackets(TABLES_2026.federal.standard.single, adjustedAnnualWage),
    ).toBeCloseTo(published, 2);
  });
});
```

This test depends on `annualTaxFromBrackets` from Task 4. If Task 4 is not done
yet, write the test, leave it failing, and complete it at the end of Task 4.

- [ ] **Step 6: Commit**

```bash
git add lib/payroll/tax/tables/2026.ts lib/payroll/tax/tables/2026.test.ts
git commit -m "feat(payroll): transcribe the 2026 Publication 15-T tables"
```

---

### Task 3: FICA

**Files:**
- Create: `lib/payroll/tax/fica.ts`
- Test: `lib/payroll/tax/fica.test.ts`

**Interfaces:**
- Consumes: `TaxTables` from Task 1.
- Produces: `computeFica({ grossForPeriod, ytdWages, tables }) → { socialSecurity, medicare, additionalMedicare }`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/payroll/tax/fica.test.ts
import { describe, it, expect } from 'vitest';
import { computeFica } from './fica';
import { TABLES_2026 } from './tables/2026';

const T = TABLES_2026;
const BASE = T.fica.socialSecurityWageBase;

describe('social security', () => {
  it('is 6.2% of wages below the base', () => {
    const r = computeFica({ grossForPeriod: 1000, ytdWages: 0, tables: T });
    expect(r.socialSecurity).toBeCloseTo(62, 2);
  });

  it('stops entirely once the base is already reached', () => {
    const r = computeFica({ grossForPeriod: 1000, ytdWages: BASE, tables: T });
    expect(r.socialSecurity).toBe(0);
  });

  it('withholds only on the portion below the base when a period crosses it', () => {
    // Review Focus 5. Half this period is under the base and half over.
    const r = computeFica({ grossForPeriod: 2000, ytdWages: BASE - 1000, tables: T });
    expect(r.socialSecurity).toBeCloseTo(1000 * 0.062, 2);
  });
});

describe('medicare', () => {
  it('is 1.45% of all wages with no cap', () => {
    const r = computeFica({ grossForPeriod: 1000, ytdWages: 5_000_000, tables: T });
    expect(r.medicare).toBeCloseTo(14.5, 2);
  });

  it('adds nothing extra below the additional-medicare threshold', () => {
    const r = computeFica({ grossForPeriod: 1000, ytdWages: 0, tables: T });
    expect(r.additionalMedicare).toBe(0);
  });

  it('adds 0.9% only on the portion above the threshold', () => {
    // Review Focus 5, the other half: 1000 of this 2000 is above 200k.
    const r = computeFica({ grossForPeriod: 2000, ytdWages: 199_000, tables: T });
    expect(r.additionalMedicare).toBeCloseTo(1000 * 0.009, 2);
  });

  it('applies the additional rate to the whole period once fully above', () => {
    const r = computeFica({ grossForPeriod: 1000, ytdWages: 250_000, tables: T });
    expect(r.additionalMedicare).toBeCloseTo(9, 2);
  });
});

describe('degenerate input', () => {
  it('withholds nothing on zero gross', () => {
    const r = computeFica({ grossForPeriod: 0, ytdWages: 0, tables: T });
    expect(r.socialSecurity).toBe(0);
    expect(r.medicare).toBe(0);
  });

  it('never returns a negative amount for negative gross', () => {
    const r = computeFica({ grossForPeriod: -500, ytdWages: 0, tables: T });
    expect(r.socialSecurity).toBe(0);
    expect(r.medicare).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/payroll/tax/fica.test.ts`
Expected: FAIL — cannot resolve `./fica`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/payroll/tax/fica.ts
import type { TaxTables } from './types';

/**
 * Social Security and Medicare for one pay period.
 *
 * Takes year-to-date wages because both the Social Security wage base and the
 * Additional Medicare threshold are ANNUAL. Computing either from the period
 * alone over-withholds every high earner all year, and nobody notices until a
 * W-2 disagrees with what was taken.
 */
export function computeFica(input: {
  grossForPeriod: number;
  ytdWages: number;
  tables: TaxTables;
}): { socialSecurity: number; medicare: number; additionalMedicare: number } {
  const { tables } = input;
  const gross = Math.max(0, input.grossForPeriod);
  const ytd   = Math.max(0, input.ytdWages);

  // Only the part of this period that still sits below the annual base is
  // taxed, so a period straddling the base is split rather than all-or-nothing.
  const ssRemaining = Math.max(0, tables.fica.socialSecurityWageBase - ytd);
  const ssWages     = Math.min(gross, ssRemaining);

  // No cap, and no employer match on the additional rate.
  const medicare = gross * tables.fica.medicareRate;

  const aboveThreshold = Math.max(
    0,
    Math.min(gross, ytd + gross - tables.fica.additionalMedicareThreshold),
  );

  return {
    socialSecurity:     ssWages * tables.fica.socialSecurityRate,
    medicare,
    additionalMedicare: aboveThreshold * tables.fica.additionalMedicareRate,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/payroll/tax/fica.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/payroll/tax/fica.ts lib/payroll/tax/fica.test.ts
git commit -m "feat(payroll): FICA with annual wage base and additional medicare"
```

---

### Task 4: Federal income tax — Publication 15-T Worksheet 1A

**Files:**
- Create: `lib/payroll/tax/federal.ts`
- Test: `lib/payroll/tax/federal.test.ts`

**Interfaces:**
- Consumes: `TaxTables`, `TaxBracket`, `EmployeeTaxProfile`, `FilingStatus` from Task 1; `periodsPerYear` from Task 1.
- Produces: `annualTaxFromBrackets(brackets, adjustedAnnualWage) → number`, `adjustedAnnualWage({...}) → number`, `computeFederalIncome({...}) → number`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/payroll/tax/federal.test.ts
import { describe, it, expect } from 'vitest';
import { annualTaxFromBrackets, adjustedAnnualWage, computeFederalIncome } from './federal';
import { TABLES_2026 } from './tables/2026';
import type { TaxBracket } from './types';

// A deliberately simple table, so these tests prove the ARITHMETIC rather than
// re-asserting the transcription (which 2026.test.ts owns).
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
    expect(adjustedAnnualWage({ ...base, multipleJobs: true })).toBeCloseTo(26_000, 2);
  });

  it('floors at zero rather than going negative', () => {
    expect(adjustedAnnualWage({ ...base, deductions: 999_999 })).toBe(0);
  });
});

describe('computeFederalIncome', () => {
  const profile = {
    classification: 'w2' as const,
    filingStatus: 'single' as const,
    multipleJobs: false,
    dependentsAmount: 0,
    otherIncome: 0,
    deductions: 0,
    extraWithholding: 0,
    exempt: false,
  };

  it('subtracts the step 3 dependents amount from the annual figure', () => {
    const without = computeFederalIncome({
      grossForPeriod: 2000, profile, payFrequency: 'biweekly', tables: TABLES_2026,
    });
    const withDeps = computeFederalIncome({
      grossForPeriod: 2000,
      profile: { ...profile, dependentsAmount: 2600 },
      payFrequency: 'biweekly',
      tables: TABLES_2026,
    });
    // 2600 annual spread over 26 periods = 100 less per period, unless the
    // result was already floored at zero.
    if (without > 100) expect(without - withDeps).toBeCloseTo(100, 2);
  });

  it('adds step 4(c) extra withholding per period', () => {
    const plain = computeFederalIncome({
      grossForPeriod: 2000, profile, payFrequency: 'biweekly', tables: TABLES_2026,
    });
    const extra = computeFederalIncome({
      grossForPeriod: 2000,
      profile: { ...profile, extraWithholding: 25 },
      payFrequency: 'biweekly',
      tables: TABLES_2026,
    });
    expect(extra - plain).toBeCloseTo(25, 2);
  });

  it('never returns a negative amount', () => {
    const r = computeFederalIncome({
      grossForPeriod: 10,
      profile: { ...profile, dependentsAmount: 50_000 },
      payFrequency: 'biweekly',
      tables: TABLES_2026,
    });
    expect(r).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/payroll/tax/federal.test.ts`
Expected: FAIL — cannot resolve `./federal`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/payroll/tax/federal.test.ts`
Expected: PASS.

- [ ] **Step 5: Complete Task 2's worked-example test**

Return to `lib/payroll/tax/tables/2026.test.ts` Step 5 and fill the worked
example now that `annualTaxFromBrackets` exists.

Run: `npx vitest run lib/payroll/tax/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/payroll/tax/federal.ts lib/payroll/tax/federal.test.ts lib/payroll/tax/tables/2026.test.ts
git commit -m "feat(payroll): federal income tax by the Pub 15-T percentage method"
```

---

### Task 5: computeWithholding — composition, statuses, shortfall

**Files:**
- Create: `lib/payroll/tax/withholding.ts`
- Test: `lib/payroll/tax/withholding.test.ts`

**Interfaces:**
- Consumes: `computeFica` (Task 3), `computeFederalIncome` (Task 4), `tablesFor` (Task 1), all types from Task 1.
- Produces: `computeWithholding(input) → Withholding`.

- [ ] **Step 1: Write the failing test**

```ts
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
    const r = run({ availableToWithhold: 50 });
    expect(r.total).toBeLessThanOrEqual(50);
  });

  it('takes FICA before federal income before state', () => {
    // The order is specified, not incidental: the W-2 boxes these feed differ,
    // so which tax went short has to be a decision rather than an accident.
    const full = run();
    const ficaOwed = full.socialSecurity + full.medicare + full.additionalMedicare;
    const r = run({ availableToWithhold: ficaOwed });

    expect(r.socialSecurity).toBeCloseTo(full.socialSecurity, 2);
    expect(r.medicare).toBeCloseTo(full.medicare, 2);
    expect(r.federalIncome).toBe(0);
    expect(r.state).toBe(0);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/payroll/tax/withholding.test.ts`
Expected: FAIL — cannot resolve `./withholding`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/payroll/tax/withholding.ts
import type { EmployeeTaxProfile, OrgTaxConfig, Withholding } from './types';
import { tablesFor } from './tables';
import { computeFica } from './fica';
import { computeFederalIncome } from './federal';

const ZERO_UNCOLLECTED = {
  federalIncome: 0, socialSecurity: 0, medicare: 0, state: 0, total: 0,
};

function none(status: Withholding['status'], notes: string[] = []): Withholding {
  return {
    status,
    federalIncome: 0, socialSecurity: 0, medicare: 0,
    additionalMedicare: 0, state: 0, total: 0,
    uncollected: { ...ZERO_UNCOLLECTED },
    notes,
  };
}

/**
 * What to withhold from one person for one pay period.
 *
 * Pure. The caller supplies the gross, the year-to-date wages, and crucially
 * `availableToWithhold` — which in a bar is NOT the gross, because cash tips an
 * employee already walked out with cannot be withheld from.
 */
export function computeWithholding(input: {
  grossForPeriod: number;
  availableToWithhold: number;
  ytdWages: number;
  profile: EmployeeTaxProfile;
  config: OrgTaxConfig;
  taxYear: number;
}): Withholding {
  const { profile, config } = input;

  if (!config.enabled) return none('not_taxed', ['Tax withholding is off for this bar.']);

  // Unclassified is NOT a contractor. Same zero, different meaning: one is a
  // decision somebody made, the other is a question nobody has answered.
  if (profile.classification === null) {
    return none('unclassified', ['No W-2 / 1099 classification set for this employee.']);
  }
  if (profile.classification === 'contractor_1099') return none('not_taxed');

  // Throws on a year with no table. Deliberate — see tablesFor.
  const tables = tablesFor(input.taxYear);

  const gross     = Math.max(0, input.grossForPeriod);
  const available = Math.max(0, input.availableToWithhold);

  const fica    = computeFica({ grossForPeriod: gross, ytdWages: input.ytdWages, tables });
  const federal = computeFederalIncome({
    grossForPeriod: gross, profile, payFrequency: config.payFrequency, tables,
  });
  const state = config.stateEnabled
    ? gross * (Math.min(100, Math.max(0, config.stateRate)) / 100)
    : 0;

  // Owed, in the order they come out when there is not enough to go round.
  const owed = [
    { key: 'socialSecurity',     amount: fica.socialSecurity },
    { key: 'medicare',           amount: fica.medicare + fica.additionalMedicare },
    { key: 'federalIncome',      amount: federal },
    { key: 'state',              amount: state },
  ] as const;

  let remaining = available;
  const taken: Record<string, number> = {};
  const short: Record<string, number> = {};

  for (const { key, amount } of owed) {
    const take = Math.min(remaining, amount);
    taken[key] = take;
    short[key] = amount - take;
    remaining -= take;
  }

  // additionalMedicare rides with medicare through the shortfall ordering, then
  // is reported separately because it is a different line on a W-2.
  const medicareTaken = taken.medicare;
  const plainMedicare = Math.min(medicareTaken, fica.medicare);
  const addlMedicare  = medicareTaken - plainMedicare;

  const total = taken.socialSecurity + medicareTaken + taken.federalIncome + taken.state;
  const uncollectedTotal =
    short.socialSecurity + short.medicare + short.federalIncome + short.state;

  const notes: string[] = [];
  if (uncollectedTotal > 0.005) {
    notes.push(
      'Withholding exceeded the pay available to withhold from. The shortfall is recorded.',
    );
  }

  return {
    status: profile.exempt ? 'exempt' : 'withheld',
    federalIncome:      taken.federalIncome,
    socialSecurity:     taken.socialSecurity,
    medicare:           plainMedicare,
    additionalMedicare: addlMedicare,
    state:              taken.state,
    total,
    uncollected: {
      federalIncome:  short.federalIncome,
      socialSecurity: short.socialSecurity,
      medicare:       short.medicare,
      state:          short.state,
      total:          uncollectedTotal,
    },
    notes,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/payroll/tax/withholding.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/payroll/tax/withholding.ts lib/payroll/tax/withholding.test.ts
git commit -m "feat(payroll): compose withholding with explicit statuses and shortfall ordering"
```

---

### Task 6: Reading the org tax config out of bar_settings

**Files:**
- Create: `lib/payroll/tax/settings.ts`
- Test: `lib/payroll/tax/settings.test.ts`

**Interfaces:**
- Consumes: `OrgTaxConfig`, `PayFrequency` from Task 1.
- Produces: `taxConfigFromSettings(settings) → OrgTaxConfig`, `withTaxConfig(settings, patch) → Record<string, unknown>`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/payroll/tax/settings.test.ts
import { describe, it, expect } from 'vitest';
import { taxConfigFromSettings, withTaxConfig } from './settings';

describe('taxConfigFromSettings', () => {
  it('defaults to off when nothing is configured', () => {
    const c = taxConfigFromSettings({});
    expect(c.enabled).toBe(false);
    expect(c.stateEnabled).toBe(false);
  });

  it('reads a configured setup', () => {
    const c = taxConfigFromSettings({
      tax: { enabled: true, payFrequency: 'weekly', stateEnabled: true, stateRate: 4.5 },
    });
    expect(c).toEqual({
      enabled: true, payFrequency: 'weekly', stateEnabled: true, stateRate: 4.5,
    });
  });

  it('defaults an unrecognised pay frequency to biweekly', () => {
    const c = taxConfigFromSettings({ tax: { enabled: true, payFrequency: 'fortnightly' } });
    expect(c.payFrequency).toBe('biweekly');
  });

  it('clamps a hand-edited state rate into range', () => {
    // Review Focus 4. The stored value is not re-validated on read, exactly as
    // barbackFractionFromSettings notes for barback_tip_pct.
    expect(taxConfigFromSettings({ tax: { stateRate: -5 } }).stateRate).toBe(0);
    expect(taxConfigFromSettings({ tax: { stateRate: 500 } }).stateRate).toBe(100);
  });

  it('survives a non-object tax key', () => {
    expect(taxConfigFromSettings({ tax: 'nonsense' }).enabled).toBe(false);
  });
});

describe('withTaxConfig', () => {
  it('leaves every other setting untouched', () => {
    // bar_settings is one JSON blob with several writers — the pos_config bug.
    const next = withTaxConfig(
      { barback_tip_pct: 20, cutoff_hour: 4 },
      { enabled: true },
    );
    expect(next.barback_tip_pct).toBe(20);
    expect(next.cutoff_hour).toBe(4);
  });

  it('merges into an existing tax object rather than replacing it', () => {
    const next = withTaxConfig(
      { tax: { enabled: true, stateRate: 5 } },
      { stateRate: 6 },
    );
    expect(next.tax).toMatchObject({ enabled: true, stateRate: 6 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/payroll/tax/settings.test.ts`
Expected: FAIL — cannot resolve `./settings`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/payroll/tax/settings.ts
import type { OrgTaxConfig, PayFrequency } from './types';

const FREQUENCIES: PayFrequency[] = ['weekly', 'biweekly', 'semimonthly', 'monthly'];

/**
 * Reads the tax setup out of organizations.bar_settings.
 *
 * Defaults to OFF. A bar that has never configured tax must not start
 * withholding because a deploy shipped, and an unset value is not consent.
 *
 * Clamps on read, like barbackFractionFromSettings: the Settings UI validates,
 * but a hand-edited row carries whatever somebody typed.
 */
export function taxConfigFromSettings(settings: Record<string, unknown>): OrgTaxConfig {
  const raw = (settings?.tax ?? {}) as Record<string, unknown>;
  const tax = typeof raw === 'object' && raw !== null ? raw : {};

  const freq = tax.payFrequency as PayFrequency;

  return {
    enabled:      tax.enabled === true,
    payFrequency: FREQUENCIES.includes(freq) ? freq : 'biweekly',
    stateEnabled: tax.stateEnabled === true,
    stateRate:    Math.min(100, Math.max(0, Number(tax.stateRate ?? 0))),
  };
}

/**
 * Builds the next bar_settings with the tax patch applied.
 *
 * bar_settings is one JSON column with several writers. Spreading a stale read
 * is how pos_config silently reverted an agent version on every sync; every
 * writer here builds from the settings it was handed and returns the result.
 */
export function withTaxConfig(
  settings: Record<string, unknown>,
  patch: Partial<OrgTaxConfig>,
): Record<string, unknown> {
  const current = (settings?.tax ?? {}) as Record<string, unknown>;
  return { ...settings, tax: { ...current, ...patch } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/payroll/tax/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/payroll/tax/settings.ts lib/payroll/tax/settings.test.ts
git commit -m "feat(payroll): read and patch the org tax config in bar_settings"
```

---

### Task 7: Migration and the employee tax profile reader

**Files:**
- Create: `supabase/migrations/20261014000000_add_employee_tax_fields.sql`
- Create: `lib/payroll/tax/profile.ts`
- Test: `lib/payroll/tax/profile.test.ts`

**Interfaces:**
- Consumes: `EmployeeTaxProfile` from Task 1.
- Produces: `taxProfileFromEmployee(row) → EmployeeTaxProfile`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20261014000000_add_employee_tax_fields.sql
--
-- Classification and W-4 data for payroll withholding.
--
-- Every column is nullable, so every existing employee row stays valid. A NULL
-- tax_classification means UNCLASSIFIED — a question nobody has answered — and
-- is deliberately not the same as 'contractor_1099', which is a decision
-- somebody made. Payroll reports the two differently.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS tax_classification   TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w4_filing_status     TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w4_multiple_jobs     BOOLEAN;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w4_dependents_amount NUMERIC(10,2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w4_other_income      NUMERIC(10,2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w4_deductions        NUMERIC(10,2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w4_extra_withholding NUMERIC(10,2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w4_exempt            BOOLEAN;

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_tax_classification_check;
ALTER TABLE employees ADD CONSTRAINT employees_tax_classification_check
  CHECK (tax_classification IS NULL OR tax_classification IN ('w2', 'contractor_1099'));

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_w4_filing_status_check;
ALTER TABLE employees ADD CONSTRAINT employees_w4_filing_status_check
  CHECK (w4_filing_status IS NULL OR w4_filing_status IN
    ('single', 'married_jointly', 'head_of_household'));
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/payroll/tax/profile.test.ts
import { describe, it, expect } from 'vitest';
import { taxProfileFromEmployee } from './profile';

describe('taxProfileFromEmployee', () => {
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

  it('carries NULL classification through as unclassified', () => {
    expect(taxProfileFromEmployee({}).classification).toBeNull();
  });

  it('reads numerics that arrive as strings from postgres', () => {
    // NUMERIC columns come back as strings over the wire.
    const p = taxProfileFromEmployee({ w4_dependents_amount: '2000.00' });
    expect(p.dependentsAmount).toBe(2000);
  });

  it('rejects an unrecognised classification rather than trusting it', () => {
    expect(taxProfileFromEmployee({ tax_classification: 'w4' }).classification).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/payroll/tax/profile.test.ts`
Expected: FAIL — cannot resolve `./profile`.

- [ ] **Step 4: Write the implementation**

```ts
// lib/payroll/tax/profile.ts
import type { EmployeeTaxProfile, FilingStatus, TaxClassification } from './types';

const CLASSIFICATIONS: TaxClassification[] = ['w2', 'contractor_1099'];
const STATUSES: FilingStatus[] = ['single', 'married_jointly', 'head_of_household'];

/** NUMERIC columns arrive as strings from postgres. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function taxProfileFromEmployee(row: Record<string, unknown>): EmployeeTaxProfile {
  const cls = row.tax_classification as TaxClassification;
  const status = row.w4_filing_status as FilingStatus;

  return {
    // An unrecognised value is unclassified, not trusted through. The CHECK
    // constraint should prevent it; a hand-edited row should not become a
    // silent withholding decision.
    classification:   CLASSIFICATIONS.includes(cls) ? cls : null,
    filingStatus:     STATUSES.includes(status) ? status : null,
    multipleJobs:     typeof row.w4_multiple_jobs === 'boolean' ? row.w4_multiple_jobs : null,
    dependentsAmount: num(row.w4_dependents_amount),
    otherIncome:      num(row.w4_other_income),
    deductions:       num(row.w4_deductions),
    extraWithholding: num(row.w4_extra_withholding),
    exempt:           typeof row.w4_exempt === 'boolean' ? row.w4_exempt : null,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/payroll/tax/profile.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261014000000_add_employee_tax_fields.sql lib/payroll/tax/profile.ts lib/payroll/tax/profile.test.ts
git commit -m "feat(payroll): employee tax classification and W-4 columns"
```

---

### Task 8: One definition of FICA

**Files:**
- Modify: `app/(app)/app/tax/actions.ts` (the `0.062` / `0.0145` / `0.006` literals and the wage-base constant)

**Interfaces:**
- Consumes: `tablesFor` (Task 1), `computeFica` (Task 3).
- Produces: no new exports.

- [ ] **Step 1: Find every hardcoded rate**

Run: `grep -n "0\.062\|0\.0145\|0\.006\|FUTA_WAGE_BASE\|ssWages" "app/(app)/app/tax/actions.ts"`

Record each line. Every one is replaced below.

- [ ] **Step 2: Replace the employee FICA arithmetic with the shared engine**

Replace the per-employee `empSS` / `empMed` / `emplrFICA` computation with a
call into the engine, so the reporting page and the withholding engine cannot
disagree:

```ts
import { tablesFor, taxYearForPeriod } from '@/lib/payroll/tax/tables';
import { computeFica } from '@/lib/payroll/tax/fica';

// inside the per-employee loop, replacing empSS / empMed / emplrFICA:
const tables = tablesFor(taxYearForPeriod(endDate));
const fica   = computeFica({ grossForPeriod: wages, ytdWages: 0, tables });

const empSS     = fica.socialSecurity;
const empMed    = fica.medicare;
// The employer matches Social Security and Medicare, but NOT the additional
// Medicare rate — that one is employee-only.
const emplrFICA = fica.socialSecurity + fica.medicare;
```

FUTA stays in this file: it is an employer tax, nothing is withheld for it, and
the withholding engine has no business knowing about it. Move only its rate and
wage base to a named constant in this file with a comment saying why it does not
live in the tax tables.

- [ ] **Step 3: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, and `/tax` figures unchanged for an employee below the wage base.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/app/tax/actions.ts"
git commit -m "refactor(tax): one definition of FICA for the report and the engine"
```

---

### Task 9: Tax setup inside the employee setup screen

**Files:**
- Modify: `app/(app)/app/payroll/_components/employees-tab.tsx`
- Modify: `app/(app)/app/payroll/_shared.ts` (add the tax columns to `loadEmployees`)
- Create: `app/(app)/app/payroll/tax-settings-actions.ts`

**Interfaces:**
- Consumes: `taxConfigFromSettings`, `withTaxConfig` (Task 6); `taxProfileFromEmployee` (Task 7).
- Produces: `saveOrgTaxConfig(patch)`, `saveEmployeeTaxProfile(employeeId, fields)`.

This is UI in an existing screen, not a new route. There is no Settings → Tax
page: per-employee classification and W-4 are edited where employees are
already edited, and the org-level knobs sit on the same screen as a panel.

- [ ] **Step 1: Extend the employee query**

In `app/(app)/app/payroll/_shared.ts`, add the eight new columns to the
`select` in `loadEmployees`. Run `npx tsc --noEmit` and fix the resulting type
errors in `employees-tab.tsx`.

- [ ] **Step 2: Write the server actions**

```ts
// app/(app)/app/payroll/tax-settings-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import { withTaxConfig } from '@/lib/payroll/tax/settings';
import type { OrgTaxConfig } from '@/lib/payroll/tax/types';

export async function saveOrgTaxConfig(patch: Partial<OrgTaxConfig>): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!org?.id) throw new Error('Organization not found');
  if (role !== 'owner') throw new Error('Only an owner can change tax settings');

  const supabase = await createClient();

  // Read, then merge, then write. bar_settings is one JSON column with several
  // writers; spreading a stale copy is the pos_config bug.
  const { data } = await supabase
    .from('organizations').select('bar_settings').eq('id', org.id).maybeSingle();

  const next = withTaxConfig(
    (data?.bar_settings ?? {}) as Record<string, unknown>,
    patch,
  );

  const { error } = await supabase
    .from('organizations').update({ bar_settings: next }).eq('id', org.id);
  if (error) throw new Error(error.message);

  revalidatePath('/app/payroll/employees');
}

export async function saveEmployeeTaxProfile(
  employeeId: string,
  fields: {
    tax_classification: string | null;
    w4_filing_status: string | null;
    w4_multiple_jobs: boolean | null;
    w4_dependents_amount: number | null;
    w4_other_income: number | null;
    w4_deductions: number | null;
    w4_extra_withholding: number | null;
    w4_exempt: boolean | null;
  },
): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!org?.id) throw new Error('Organization not found');
  if (role !== 'owner' && role !== 'manager') throw new Error('Not permitted');

  const supabase = await createClient();
  const { error } = await supabase
    .from('employees')
    .update(fields)
    .eq('id', employeeId)
    .eq('organization_id', org.id);   // scoped by hand — see AGENTS.md
  if (error) throw new Error(error.message);

  revalidatePath('/app/payroll/employees');
}
```

- [ ] **Step 3: Add the org panel and the per-employee fields**

In `employees-tab.tsx`, following the file's existing form and dialog patterns
(Base UI — `render`, controlled dialogs, no `asChild`):

- A **Tax setup** panel above the roster: enable toggle, pay frequency select,
  state withholding toggle and rate. Calls `saveOrgTaxConfig`.
- In each employee's editor: a **classification** select (Unclassified / W-2
  employee / 1099 contractor) and, shown only when W-2 is selected, the W-4
  fields. Calls `saveEmployeeTaxProfile`.
- An **Unclassified** badge on any employee whose `tax_classification` is null,
  so the roster shows at a glance who still needs an answer.

Copy rules: the state rate is labelled **"Flat state rate (estimate)"**, and the
panel carries the line **"Rail calculates withholding. It does not file returns,
remit deposits, or produce W-2s."**

- [ ] **Step 4: Verify**

Run: `npm run build && npx tsc --noEmit && npm run lint -- --max-warnings=99999`
Then run the app and confirm: setting a rate persists; an unclassified employee
shows the badge; the W-4 fields appear only for W-2.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/app/payroll/_components/employees-tab.tsx" "app/(app)/app/payroll/_shared.ts" "app/(app)/app/payroll/tax-settings-actions.ts"
git commit -m "feat(payroll): tax setup inside the employee setup screen"
```

---

### Task 10: Withholding on the review screen and in the run snapshot

**Files:**
- Modify: `lib/payroll/run-diff.ts` (the `SnapshotEntry` type only)
- Test: `lib/payroll/run-diff.test.ts`
- Modify: `app/(app)/app/payroll/review/page.tsx`
- Modify: `app/(app)/app/payroll/approval-actions.ts` (snapshot construction)

**Interfaces:**
- Consumes: `computeWithholding` (Task 5), `taxConfigFromSettings` (Task 6), `taxProfileFromEmployee` (Task 7), `taxYearForPeriod` (Task 1), `Withholding` (Task 1).
- Produces: `SnapshotEntry.withholding?: Withholding`.

**`diffPayrollRun`'s staleness logic is NOT modified.** `SnapshotEntry` already
documents the rule: staleness means somebody's hours or pay moved, and it must
not start firing because a derived figure moved. Withholding is derived, and in
this phase it changes nothing about what is paid — so a re-transcribed tax table
or an edited W-4 must not make every open run stale. When net pay lands,
withholding becomes material to what is paid and that decision gets revisited
deliberately, as its own change.

- [ ] **Step 1: Write the failing test**

```ts
// append to lib/payroll/run-diff.test.ts
import { describe, it, expect } from 'vitest';
import { diffPayrollRun, type SnapshotEntry } from './run-diff';

describe('withholding is carried but not compared', () => {
  const base: SnapshotEntry = {
    employeeId: 'e1',
    employeeName: 'Alex',
    totalHours: 40,
    totalCompensation: 800,
  };

  it('a changed withholding total does not make a run stale', () => {
    // Withholding is derived, and in this phase it changes nothing about what
    // is paid. A re-transcribed tax table must not put every open run into
    // "somebody's numbers moved" — that signal is reserved for hours and pay.
    const before = { ...base, withholding: { total: 100 } as never };
    const after  = { ...base, withholding: { total: 140 } as never };

    const diff = diffPayrollRun([before], [after]);

    expect(diff.isStale).toBe(false);
    expect(diff.changes).toEqual([]);
  });

  it('still goes stale when pay actually moves', () => {
    const after = { ...base, totalCompensation: 900 };

    const diff = diffPayrollRun([base], [after]);

    expect(diff.isStale).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/payroll/run-diff.test.ts`
Expected: FAIL — `withholding` is not a property of `SnapshotEntry`.

- [ ] **Step 3: Add the field to the snapshot type**

In `lib/payroll/run-diff.ts`, add to `SnapshotEntry` alongside the other
optional frozen fields, inside the existing comment block's scope:

```ts
  /**
   * What was withheld, frozen at submit. Optional like everything else here:
   * runs approved before withholding existed carry none, and must keep parsing.
   *
   * diffPayrollRun ignores it, same as breakdown/shifts/tipContext — it is a
   * derived figure, and in this phase it does not change what anybody is paid.
   */
  withholding?: Withholding;
```

Import the type: `import type { Withholding } from './tax/types';`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/payroll/run-diff.test.ts`
Expected: PASS — including the existing tests that pin the staleness rule.

- [ ] **Step 5: Compute withholding alongside the entries**

In `review/page.tsx`, after `computePayroll(startDate, endDate)`:

```ts
const taxConfig = taxConfigFromSettings(settings);
const taxYear   = taxYearForPeriod(endDate);

// FICA needs year-to-date wages: the Social Security wage base and the
// Additional Medicare threshold are both annual, so a period figure alone
// over-withholds every high earner all year.
const ytdEntries = await computePayroll(`${taxYear}-01-01`, startDate);
const ytdByEmployee = new Map(
  ytdEntries.map((e) => [e.employeeId, e.totalCompensation]),
);

const withholdingByEmployee = new Map(
  entries.map((e) => [
    e.employeeId,
    computeWithholding({
      grossForPeriod: e.totalCompensation,
      // Only the employer-paid wage portion can be withheld from. Cash tips the
      // employee already walked out with are not available. See the open
      // question at the end of this plan before shipping this line.
      availableToWithhold: e.regularPay + e.overtimePay,
      ytdWages: ytdByEmployee.get(e.employeeId) ?? 0,
      profile: taxProfileFromEmployee(employeeRowsById.get(e.employeeId) ?? {}),
      config: taxConfig,
      taxYear,
    }),
  ]),
);
```

`employeeRowsById` comes from the same `loadEmployees` call Task 9 extended;
build it as a `Map` keyed on `id`.

- [ ] **Step 6: Display it**

Add a withholding column to the review table showing the total, with the
per-tax breakdown on expand. Render the statuses distinctly:

- `unclassified` — an amber badge reading **"Needs W-2 / 1099"**, because it is
  an unanswered question, not a decision.
- `not_taxed` — a quiet "Contractor".
- a non-zero `uncollected.total` — a warning naming the shortfall.

Above the table, while net pay is still unimplemented, show:
**"Tax shown is calculated but not yet deducted — payouts still pay gross."**

- [ ] **Step 7: Freeze it in the snapshot**

In `approval-actions.ts`, set `withholding` on each snapshot entry at submit,
built from the same `withholdingByEmployee` map. The snapshot is what freezes
the numbers an approver agreed to, so a tax settings change afterwards cannot
restate an approved run — the same protection `usage_logs.unit_cost` gives the
books.

- [ ] **Step 8: Verify**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/payroll/run-diff.ts lib/payroll/run-diff.test.ts "app/(app)/app/payroll/review/page.tsx" "app/(app)/app/payroll/approval-actions.ts"
git commit -m "feat(payroll): show withholding on review and freeze it in the snapshot"
```

---

## Open question for the implementer

`availableToWithhold` is set in Task 10 Step 3 to `regularPay + overtimePay` —
the employer-paid wage portion, excluding tips. **This is an assumption that was
raised and not yet confirmed.** It is correct when tips are cashed out nightly
and wrong when tips are paid on the cheque, in which case tips are also
available to withhold from and the figure should be `totalCompensation`.

The engine takes it as a parameter precisely so this is a one-line decision at
the call site rather than a change to the tax math. Confirm how tips actually
reach people before Task 10 ships; Tasks 1–9 do not depend on the answer.
