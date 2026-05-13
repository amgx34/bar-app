'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import { computePayroll } from '../payroll/actions';
import type { PayrollEntry } from '../payroll/actions';

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
  employerFICA: number;
  futatEstimate: number;
  quarterlyBreakdown: QuarterRow[];
  employeeSummaries: EmployeeTaxRow[];
};

export type QuarterRow = {
  label: string;
  sales: number;
  tips: number;
  wages: number;
  employerFICA: number;
};

export type EmployeeTaxRow = {
  name: string;
  role: string | null;
  totalWages: number;
  totalTips: number;
  ssWages: number;
  ssTaxEmployee: number;
  medicareTaxEmployee: number;
  employerFICA: number;
};

const FUTA_WAGE_BASE = 7000;

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

  // Employer FICA: 7.65% on wages (6.2% SS + 1.45% Medicare), SS capped per employee
  const SS_BASE = 168600; // use 2024 base as conservative estimate
  const employeeSummaries: EmployeeTaxRow[] = payrollEntries.map((e) => {
    const wages     = e.regularPay + e.overtimePay;
    const ssWages   = Math.min(wages, SS_BASE);
    const empSS     = ssWages * 0.062;
    const empMed    = wages   * 0.0145;
    const emplrFICA = ssWages * 0.062 + wages * 0.0145;
    return {
      name: e.employeeName,
      role: e.role,
      totalWages: wages,
      totalTips: e.tipAmount,
      ssWages,
      ssTaxEmployee: empSS,
      medicareTaxEmployee: empMed,
      employerFICA: emplrFICA,
    };
  });

  const employerFICA   = employeeSummaries.reduce((s, e) => s + e.employerFICA, 0);
  const futatEstimate  = payrollEntries.length * FUTA_WAGE_BASE * 0.006; // effective 0.6% after credit

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
      employerFICA: Math.min(qWages, SS_BASE) * 0.062 + qWages * 0.0145,
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
