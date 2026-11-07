// lib/payroll/tax/tables/2026.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TABLES_2026 } from './2026';
import { computeFederalIncome } from '../federal';
import type { EmployeeTaxProfile, FilingStatus, TaxBracket } from '../types';

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
    //
    // Within a dollar, not a cent: the Step 2 schedules are the joint figures
    // halved, and the IRS rounds the halved floors (217,875 / 2 -> 108,938),
    // so single/step2 prints 20,512 where the arithmetic gives 20,512.12. A
    // base copied from the wrong row is off by thousands, not cents.
    for (let i = 1; i < brackets.length; i++) {
      const prev = brackets[i - 1];
      const expected = prev.base + prev.rate * (brackets[i].floor - prev.floor);
      expect(Math.abs(brackets[i].base - expected)).toBeLessThan(1);
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
    // Plausibility bound, not a claim about the real figure: Worksheet 1A line
    // 1g has been in the low-to-mid five figures for years. A slipped decimal
    // or a stray 0 lands outside it. Skipped while placeholder, whose $1
    // deliberately fails it; this is where a wrong transcription gets caught.
    it.skipIf(TABLES_2026.placeholder)(`${status}: standard deduction is plausible`, () => {
      const d = TABLES_2026.federal.standardDeduction[status];
      expect(d).toBeGreaterThanOrEqual(5_000);
      expect(d).toBeLessThanOrEqual(40_000);
    });
  }
});

describe('2026 FICA constants', () => {
  it('social security is 6.2% up to a wage base', () => {
    expect(TABLES_2026.fica.socialSecurityRate).toBeCloseTo(0.062, 5);
  });

  // The wage base has been indexed up from 160,200 (2023) and is not going to
  // be below 150k or above 250k in 2026. Skipped while placeholder (100,001
  // fails it on purpose); it bites on the real transcription.
  it.skipIf(TABLES_2026.placeholder)('social security wage base is plausible', () => {
    const base = TABLES_2026.fica.socialSecurityWageBase;
    expect(base).toBeGreaterThanOrEqual(150_000);
    expect(base).toBeLessThanOrEqual(250_000);
  });

  it('medicare is 1.45% with an additional 0.9% above a threshold', () => {
    expect(TABLES_2026.fica.medicareRate).toBeCloseTo(0.0145, 5);
    expect(TABLES_2026.fica.additionalMedicareRate).toBeCloseTo(0.009, 5);
    expect(TABLES_2026.fica.additionalMedicareThreshold).toBe(200_000);
  });
});

describe('transcription status', () => {
  // The structural tests pass on self-consistent placeholders, so they cannot
  // tell "transcribed" from "stand-in". The `placeholder` field is meant to,
  // but a field is just a claim. Tie it to the file's content so the claim
  // and the figures cannot drift apart in either direction: a PLACEHOLDER
  // marker left behind cannot sit under placeholder:false, and flipping the
  // field to true cannot hide a fully transcribed file.
  const source = readFileSync(join(__dirname, '2026.ts'), 'utf8');
  const markers = source
    .split(String.fromCharCode(10))
    .filter((line) => /\/\/\s*PLACEHOLDER/.test(line)).length;

  it('is marked placeholder exactly when PLACEHOLDER markers remain in 2026.ts', () => {
    expect(TABLES_2026.placeholder).toBe(markers > 0);
  });

});

// The only real proof a transcription is right: reproduce figures the IRS
// printed. The structural tests above pass on any self-consistent table.
//
// Pub 15-T prints no worked example of the annual method, but it does print
// the weekly Wage Bracket Method tables (Section 2, Forms W-4 from 2020 or
// later), which are the same Worksheet 1A evaluated at each $10 row and
// rounded to the dollar. Running the WHOLE worksheet (computeFederalIncome:
// annualise, line 1g, schedule choice, de-annualise) at a row's midpoint must
// land on the printed figure. That pins the line 1g amounts, which schedule
// the Step 2 box selects, and every schedule's floors, bases and rates in the
// bands these wages reach (0% through 24%).
//
// Copied verbatim from the 2026 weekly table; nothing here is computed. The
// bands above ~$100k a year are in no wage-bracket table and are held only by
// the structural tests.
type Printed = { mfj: number; hoh: number; single: number };
const WEEKLY_ROWS: { atLeast: number; lessThan: number; standard: Printed; step2: Printed }[] = [
  { atLeast:   495, lessThan:   505, standard: { mfj:  0, hoh:   4, single:  19 }, step2: { mfj:  19, hoh:  29, single:  39 } },
  { atLeast:   745, lessThan:   755, standard: { mfj: 13, hoh:  29, single:  48 }, step2: { mfj:  48, hoh:  59, single:  80 } },
  { atLeast:   995, lessThan: 1_005, standard: { mfj: 38, hoh:  57, single:  78 }, step2: { mfj:  78, hoh: 101, single: 135 } },
  { atLeast: 1_495, lessThan: 1_505, standard: { mfj: 96, hoh: 117, single: 160 }, step2: { mfj: 160, hoh: 216, single: 252 } },
];

const KEY: Record<FilingStatus, keyof Printed> = {
  married_jointly: 'mfj', head_of_household: 'hoh', single: 'single',
};

describe('reproduces the Pub 15-T 2026 weekly wage-bracket table', () => {
  for (const row of WEEKLY_ROWS) {
    const wage = (row.atLeast + row.lessThan) / 2;
    for (const status of STATUSES) {
      for (const step2 of [false, true]) {
        const printed = (step2 ? row.step2 : row.standard)[KEY[status]];
        it(`$${row.atLeast}-$${row.lessThan} ${status}${step2 ? ' / step 2' : ''} = $${printed}`, () => {
          const profile: EmployeeTaxProfile = {
            classification: 'w2', filingStatus: status, multipleJobs: step2,
            dependentsAmount: null, otherIncome: null, deductions: null,
            extraWithholding: null, exempt: false,
          };
          const weekly = computeFederalIncome({
            grossForPeriod: wage, profile, payFrequency: 'weekly', tables: TABLES_2026,
          });
          expect(Math.round(weekly)).toBe(printed);
        });
      }
    }
  }
});
