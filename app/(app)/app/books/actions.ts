'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import { computePayroll } from '../payroll/actions';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export type MonthlyFinancials = {
  month: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  labor: number;
};

export type LossesBreakdown = {
  voids: number;
  comps: number;
  spills: number;
  discounts: number;
};

export type BooksData = {
  startDate: string;
  endDate: string;
  revenue: number;
  tips: number;
  cogs: number;
  grossProfit: number;
  totalLabor: number;
  netOperating: number;
  totalLosses: number;
  grossMarginPct: number;
  laborPct: number;
  monthlyData: MonthlyFinancials[];
  lossesBreakdown: LossesBreakdown;
};

export async function getBooksData(startDate: string, endDate: string): Promise<BooksData> {
  const { org } = await getCurrentOrg();
  const supabase = await createClient();
  const orgId = org.id;

  const [
    { data: zDays },
    { data: usageLogs },
    { data: losses },
    payrollEntries,
  ] = await Promise.all([
    supabase
      .from('z_report_days')
      .select('report_date, total_sales, cash_tips, cc_tips')
      .eq('organization_id', orgId)
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .order('report_date'),
    supabase
      .from('usage_logs')
      .select('quantity, reason, created_at, inventory_items(cost_price)')
      .eq('organization_id', orgId)
      .eq('reason', 'delivery')
      .gte('created_at', startDate + 'T00:00:00Z')
      .lte('created_at', endDate + 'T23:59:59Z'),
    supabase
      .from('losses_reports')
      .select('voids_amount, comps_amount, spills_amount, discounts_amount')
      .eq('organization_id', orgId)
      .gte('report_date', startDate)
      .lte('report_date', endDate),
    computePayroll(startDate, endDate),
  ]);

  const days = zDays ?? [];
  const logs = usageLogs ?? [];
  const lossRows = losses ?? [];

  const revenue = days.reduce((s, d) => s + (d.total_sales ?? 0), 0);
  const tips    = days.reduce((s, d) => s + (d.cash_tips ?? 0) + (d.cc_tips ?? 0), 0);

  function getCostPrice(raw: unknown): number {
    if (!raw) return 0;
    const obj = Array.isArray(raw) ? raw[0] : raw;
    return (obj as { cost_price?: number | null })?.cost_price ?? 0;
  }

  const cogs = logs.reduce((s, l) => {
    return s + (l.quantity ?? 0) * getCostPrice(l.inventory_items);
  }, 0);

  const totalLabor = payrollEntries.reduce((s, e) => s + e.regularPay + e.overtimePay, 0);

  const lossesBreakdown: LossesBreakdown = {
    voids:     lossRows.reduce((s, r) => s + (r.voids_amount ?? 0), 0),
    comps:     lossRows.reduce((s, r) => s + (r.comps_amount ?? 0), 0),
    spills:    lossRows.reduce((s, r) => s + (r.spills_amount ?? 0), 0),
    discounts: lossRows.reduce((s, r) => s + (r.discounts_amount ?? 0), 0),
  };
  const totalLosses = Object.values(lossesBreakdown).reduce((a, b) => a + b, 0);

  const grossProfit  = revenue - cogs;
  const netOperating = grossProfit - totalLabor - totalLosses;

  // Monthly buckets
  const monthMap = new Map<string, { revenue: number; cogs: number; labor: number }>();

  for (const d of days) {
    const dt  = new Date(d.report_date + 'T00:00:00');
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap.has(key)) monthMap.set(key, { revenue: 0, cogs: 0, labor: 0 });
    monthMap.get(key)!.revenue += d.total_sales ?? 0;
  }

  for (const l of logs) {
    const dt  = new Date(l.created_at as string);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap.has(key)) monthMap.set(key, { revenue: 0, cogs: 0, labor: 0 });
    monthMap.get(key)!.cogs += (l.quantity ?? 0) * getCostPrice(l.inventory_items);
  }

  // Distribute labor evenly across months
  const monthKeys = [...monthMap.keys()].sort();
  const laborPerMonth = monthKeys.length > 0 ? totalLabor / monthKeys.length : 0;
  for (const m of monthMap.values()) m.labor = laborPerMonth;

  const monthlyData: MonthlyFinancials[] = monthKeys.map((key) => {
    const [yr, mo] = key.split('-').map(Number);
    const m = monthMap.get(key)!;
    return {
      month:       `${MONTHS[mo - 1]} ${yr}`,
      revenue:     m.revenue,
      cogs:        m.cogs,
      grossProfit: m.revenue - m.cogs,
      labor:       m.labor,
    };
  });

  return {
    startDate, endDate,
    revenue, tips, cogs, grossProfit, totalLabor, netOperating, totalLosses,
    lossesBreakdown, monthlyData,
    grossMarginPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    laborPct:       revenue > 0 ? (totalLabor  / revenue) * 100 : 0,
  };
}
