// lib/payroll/tax/tables/2026.test.ts
import { describe, it, expect } from 'vitest';
import { TABLES_2026, TABLES_2026_ARE_PLACEHOLDERS } from './2026';
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

describe('transcription status', () => {
  // The structural tests above pass against placeholder figures, because the
  // placeholders are built to be self-consistent. They therefore cannot tell
  // "transcribed" from "stand-in". This flag is the only thing that can, and
  // it is pinned here so flipping it is a deliberate, reviewed act.
  it('records that the figures are still placeholders', () => {
    expect(TABLES_2026_ARE_PLACEHOLDERS).toBe(true);
  });

  // Replace with real tests when transcription happens: the publication's
  // worked examples reproduced through annualTaxFromBrackets (a later task).
  it.todo('reproduces Pub 15-T 2026 worked examples for every filing status');
  it.todo('TABLES_2026_ARE_PLACEHOLDERS is false and no PLACEHOLDER marker remains');
});
