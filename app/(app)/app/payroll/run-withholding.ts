import { computePayroll, type PayrollEntry } from './actions';
import { loadEmployees } from './_shared';
import { computeWithholding } from '@/lib/payroll/tax/withholding';
import { taxConfigFromSettings } from '@/lib/payroll/tax/settings';
import { taxProfileFromEmployee } from '@/lib/payroll/tax/profile';
import { taxYearForPeriod } from '@/lib/payroll/tax/tables';
import { tablesStatus } from '@/lib/payroll/tax/ui';
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
        // Tips are paid out on the cheque at this bar (confirmed by the user),
        // so the employer controls that money and all of it is available to
        // withhold against: available equals gross. A bar that cashed tips out
        // nightly would need `e.regularPay + e.overtimePay` here instead, since
        // cash an employee already walked out with cannot be withheld from. This
        // is a global assumption, not a per-org setting. The engine's shortfall
        // handling stays as the safety net; it is just unreachable at 100%.
        availableToWithhold: e.totalCompensation,
        ytdWages: ytdByEmployee.get(e.employeeId) ?? 0,
        profile: taxProfileFromEmployee(employeeRowsById.get(e.employeeId) ?? {}),
        config,
        taxYear,
      }),
    );
  }
  return { kind: 'ok', byEmployee };
}
