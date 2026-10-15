// lib/payroll/tax/tables/2026.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  // Replace with real tests when transcription happens: the publication's
  // worked examples reproduced through annualTaxFromBrackets (a later task).
  it.todo('reproduces Pub 15-T 2026 worked examples for every filing status');
});
