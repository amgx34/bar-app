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
