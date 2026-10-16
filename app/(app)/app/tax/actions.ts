'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import { computePayroll } from '../payroll/actions';
import type { PayrollEntry } from '../payroll/actions';
import { tablesFor, taxYearForPeriod } from '@/lib/payroll/tax/tables';
import { computeFica } from '@/lib/payroll/tax/fica';
import type { TaxTables } from '@/lib/payroll/tax/types';

export type YearlyPayrollData = {
  year: number;
  entries: PayrollEntry[];
};

export async function getYearlyPayrollData(year: number): Promise<YearlyPayrollData> {
  return {
    year,
    entries: await computePayroll(`${year}-01-01`, `${year}-12-31`),
  };
}

export type TaxReportData = {
  startDate: string;
  endDate: string;
  orgName: string;
  totalSales: number;
  totalTips: number;
  totalWages: number;
  totalRegularPay: number;
  totalOvertimePay: number;
  totalTipsPaid: number;
  employeeCount: number;
  /**
   * NULL means "no tax tables for this year", never "the bar owed nothing". A
   * zero here would read as a true claim about the bar; null is the absence of
   * a figure. Same rule as z_report_days.cash_sales (AGENTS.md).
   */
  employerFICA: number | null;
  futatEstimate: number;
  /** Year whose tables were looked up for the FICA figures. */
  ficaYear: number;
  /** Non-null exactly when the FICA figures are null: the sentence to show. */
  ficaUnavailableReason: string | null;
  quarterlyBreakdown: QuarterRow[];
  employeeSummaries: EmployeeTaxRow[];
};

export type QuarterRow = {
  label: string;
  sales: number;
  tips: number;
  wages: number;
  employerFICA: number | null;
};

export type EmployeeTaxRow = {
  name: string;
  role: string | null;
  totalWages: number;
  totalTips: number;
  // All four are null together when the year has no tax tables (see TaxReportData).
  ssWages: number | null;
  ssTaxEmployee: number | null;
  medicareTaxEmployee: number | null;
  employerFICA: number | null;
};

// FUTA lives here, not in lib/payroll/tax/tables, on purpose: it is an
// employer-only tax, nothing is withheld from an employee for it, and the
// withholding engine must not grow a reason to know about it. 0.6% is the
// effective rate after the 5.4% state-unemployment credit; $7,000 is the wage
// base per employee.
const FUTA_WAGE_BASE = 7000;
const FUTA_EFFECTIVE_RATE = 0.006;

/**
 * `tablesFor` throws on an unknown year by design, and this report accepts any
 * date range. Resolve once and turn the throw into a sentence, so a missing
 * table costs the page only its FICA figures. Never substitute another year's
 * tables: a plausible but wrong FICA estimate is what the throw prevents.
 */
function resolveTables(year: number): { tables: TaxTables | null; reason: string | null } {
  try {
    return { tables: tablesFor(year), reason: null };
  } catch {
    return {
      tables: null,
      reason: `Payroll tax tables for ${year} have not been entered yet, so Social Security and Medicare figures are not shown. Sales, tips and wages are unaffected.`,
    };
  }
}

export async function getTaxReportData(startDate: string, endDate: string): Promise<TaxReportData> {
  const { org } = await getCurrentOrg();
  const supabase = await createClient();

  const [{ data: zDays }, payrollEntries] = await Promise.all([
    supabase
      .from('z_report_days')
      .select('report_date, total_sales, cash_tips, cc_tips')
      .eq('organization_id', org.id)
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .order('report_date'),
    computePayroll(startDate, endDate),
  ]);

  const days = zDays ?? [];
  const totalSales = days.reduce((s, d) => s + (d.total_sales ?? 0), 0);
  const totalTips  = days.reduce((s, d) => s + (d.cash_tips ?? 0) + (d.cc_tips ?? 0), 0);

  const totalRegularPay  = payrollEntries.reduce((s, e) => s + e.regularPay, 0);
  const totalOvertimePay = payrollEntries.reduce((s, e) => s + e.overtimePay, 0);
  const totalTipsPaid    = payrollEntries.reduce((s, e) => s + e.tipAmount, 0);
  const totalWages       = totalRegularPay + totalOvertimePay;

  // Year of the END date, matching how the withholding engine picks a period's
  // tables. A range spanning New Year is taxed under one year's rates here.
  const ficaYear = taxYearForPeriod(endDate);
  const { tables, reason: ficaUnavailableReason } = resolveTables(ficaYear);

  const employeeSummaries: EmployeeTaxRow[] = payrollEntries.map((e) => {
    const wages = e.regularPay + e.overtimePay;
    const base = {
      name: e.employeeName,
      role: e.role,
      totalWages: wages,
      totalTips: e.tipAmount,
    };
    if (!tables) {
      return { ...base, ssWages: null, ssTaxEmployee: null, medicareTaxEmployee: null, employerFICA: null };
    }
    // `wages` is already the whole range, so it is the "period" and ytd is 0:
    // the annual wage base then applies to it directly. Do not pass a running
    // total here as well; that would apply the cap twice.
    const fica = computeFica({ grossForPeriod: wages, ytdWages: 0, tables });
    return {
      ...base,
      ssWages: Math.min(wages, tables.fica.socialSecurityWageBase),
      ssTaxEmployee: fica.socialSecurity,
      medicareTaxEmployee: fica.medicare,
      // Employer matches Social Security and Medicare but NOT Additional
      // Medicare, which is employee-only. Adding it here would overstate the
      // employer's cost with no visible symptom.
      employerFICA: fica.socialSecurity + fica.medicare,
    };
  });

  const employerFICA   = tables
    ? employeeSummaries.reduce((s, e) => s + (e.employerFICA ?? 0), 0)
    : null;
  const futatEstimate  = payrollEntries.length * FUTA_WAGE_BASE * FUTA_EFFECTIVE_RATE;

  // Quarterly breakdown
  const quarterMap = new Map<string, { sales: number; tips: number; wages: number }>();
  for (const d of days) {
    const dt = new Date(d.report_date + 'T00:00:00');
    const q  = `Q${Math.floor(dt.getMonth() / 3) + 1} ${dt.getFullYear()}`;
    if (!quarterMap.has(q)) quarterMap.set(q, { sales: 0, tips: 0, wages: 0 });
    const r = quarterMap.get(q)!;
    r.sales += d.total_sales ?? 0;
    r.tips  += (d.cash_tips ?? 0) + (d.cc_tips ?? 0);
  }

  const quarterlyBreakdown: QuarterRow[] = [...quarterMap.entries()].map(([label, { sales, tips }]) => {
    // Rough wages per quarter = total wages / number of quarters
    const qWages = payrollEntries.length > 0 ? totalWages / (quarterMap.size || 1) : 0;
    return {
      label,
      sales,
      tips,
      wages: qWages,
      employerFICA: tables
        ? (({ socialSecurity, medicare }) => socialSecurity + medicare)(
            computeFica({ grossForPeriod: qWages, ytdWages: 0, tables }),
          )
        : null,
    };
  });

  return {
    startDate,
    endDate,
    orgName: org.name,
    totalSales,
    totalTips,
    totalWages,
    totalRegularPay,
    totalOvertimePay,
    totalTipsPaid,
    employeeCount: payrollEntries.length,
    employerFICA,
    futatEstimate,
    ficaYear,
    ficaUnavailableReason,
    quarterlyBreakdown,
    employeeSummaries,
  };
}

export async function getAvailableYears(): Promise<number[]> {
  const { org } = await getCurrentOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from('z_report_days')
    .select('report_date')
    .eq('organization_id', org.id)
    .order('report_date');

  const years = new Set<number>();
  for (const d of data ?? []) {
    years.add(new Date((d.report_date as string) + 'T00:00:00').getFullYear());
  }
  const current = new Date().getFullYear();
  years.add(current);
  return [...years].sort((a, b) => b - a);
}
