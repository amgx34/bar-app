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
