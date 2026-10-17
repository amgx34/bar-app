import { computePayroll, type PayrollEntry } from './actions';
import { loadEmployees } from './_shared';
import { computeWithholding } from '@/lib/payroll/tax/withholding';
import { taxConfigFromSettings, hasExplicitPayFrequency } from '@/lib/payroll/tax/settings';
import { taxProfileFromEmployee } from '@/lib/payroll/tax/profile';
import { taxYearForPeriod } from '@/lib/payroll/tax/tables';
import { tablesStatus, availableToWithholdFor } from '@/lib/payroll/tax/ui';
import type { Withholding } from '@/lib/payroll/tax/types';
import { ytdRange, type RunWithholding } from '@/lib/payroll/tax/run';

export type { RunWithholding };

export async function computeRunWithholding(
  settings: Record<string, unknown>,
  startDate: string,
  endDate: string,
  entries: PayrollEntry[],
): Promise<RunWithholding> {
  const config = taxConfigFromSettings(settings);
  if (!config.enabled) return { kind: 'off' };

  // Enabling is refused without a chosen frequency, but a hand-edited row can
  // still say enabled with none. Refuse rather than annualise a guess.
  if (!hasExplicitPayFrequency(settings)) {
    return {
      kind: 'unusable',
      message: 'Withholding is switched on but no pay frequency has been chosen. Choose how often you pay in Tax setup.',
    };
  }

  const taxYear = taxYearForPeriod(endDate);
  const status = tablesStatus(taxYear);
  if (!status.usable) return { kind: 'unusable', message: status.message };

  // FICA needs year-to-date wages: the Social Security wage base and the
  // Additional Medicare threshold are annual, so a period figure alone
  // over-withholds every high earner all year. The range ends the day BEFORE
  // this period, or the first day's pay would count twice. A period starting
  // on or before 1 January has no earlier wages this year.
  // FICA needs year-to-date wages: the Social Security wage base and the
  // Additional Medicare threshold are annual. See ytdRange for the boundary.
  const range = ytdRange(startDate, taxYear);
  const ytdEntries = range ? await computePayroll(range.from, range.to) : [];
  const ytdByEmployee = new Map(ytdEntries.map((e) => [e.employeeId, e.totalCompensation]));

  const employeeRowsById = new Map(
    (await loadEmployees()).map((row) => [row.id, row as Record<string, unknown>]),
  );

  const byEmployee = new Map<string, Withholding>();
  for (const e of entries) {
    byEmployee.set(
      e.employeeId,
      computeWithholding({
        grossForPeriod: e.totalCompensation,
        // Per-org setting (default: tips cashed out nightly, the safe side).
        availableToWithhold: availableToWithholdFor(e, config),
        ytdWages: ytdByEmployee.get(e.employeeId) ?? 0,
        profile: taxProfileFromEmployee(employeeRowsById.get(e.employeeId) ?? {}),
        config,
        taxYear,
      }),
    );
  }
  return { kind: 'ok', byEmployee };
}
