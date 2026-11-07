// lib/payroll/tax/fica.test.ts
import { describe, it, expect } from 'vitest';
import { computeFica } from './fica';
import { TABLES_2026 } from './tables/2026';

// Every expectation derives from the table, not from a literal. A change to
// the table must make these fail honestly rather than silently keep passing.
const T = TABLES_2026;
const BASE = T.fica.socialSecurityWageBase;
const THRESHOLD = T.fica.additionalMedicareThreshold;

describe('social security', () => {
  it('is 6.2% of wages below the base', () => {
    const r = computeFica({ grossForPeriod: 1000, ytdWages: 0, tables: T });
    expect(r.socialSecurity).toBeCloseTo(1000 * T.fica.socialSecurityRate, 2);
  });

  it('stops entirely once the base is already reached', () => {
    const r = computeFica({ grossForPeriod: 1000, ytdWages: BASE, tables: T });
    expect(r.socialSecurity).toBe(0);
  });

  it('withholds only on the portion below the base when a period crosses it', () => {
    // Review Focus 5. Half this period is under the base and half over.
    const r = computeFica({ grossForPeriod: 2000, ytdWages: BASE - 1000, tables: T });
    expect(r.socialSecurity).toBeCloseTo(1000 * T.fica.socialSecurityRate, 2);
  });
});

describe('medicare', () => {
  it('is 1.45% of all wages with no cap', () => {
    const r = computeFica({ grossForPeriod: 1000, ytdWages: 5_000_000, tables: T });
    expect(r.medicare).toBeCloseTo(1000 * T.fica.medicareRate, 2);
  });

  it('adds nothing extra below the additional-medicare threshold', () => {
    const r = computeFica({ grossForPeriod: 1000, ytdWages: 0, tables: T });
    expect(r.additionalMedicare).toBe(0);
  });

  it('adds the additional rate only on the portion above the threshold', () => {
    // Review Focus 5, the other half: 1000 of this 2000 is above the threshold.
    const r = computeFica({ grossForPeriod: 2000, ytdWages: THRESHOLD - 1000, tables: T });
    expect(r.additionalMedicare).toBeCloseTo(1000 * T.fica.additionalMedicareRate, 2);
  });

  it('applies the additional rate to the whole period once fully above', () => {
    const r = computeFica({ grossForPeriod: 1000, ytdWages: THRESHOLD + 50_000, tables: T });
    expect(r.additionalMedicare).toBeCloseTo(1000 * T.fica.additionalMedicareRate, 2);
  });
});

describe('degenerate input', () => {
  it('withholds nothing on zero gross', () => {
    const r = computeFica({ grossForPeriod: 0, ytdWages: 0, tables: T });
    expect(r.socialSecurity).toBe(0);
    expect(r.medicare).toBe(0);
    expect(r.additionalMedicare).toBe(0);
  });

  it('never returns a negative amount for negative gross', () => {
    const r = computeFica({ grossForPeriod: -500, ytdWages: 0, tables: T });
    expect(r.socialSecurity).toBe(0);
    expect(r.medicare).toBe(0);
    expect(r.additionalMedicare).toBe(0);
  });
});
