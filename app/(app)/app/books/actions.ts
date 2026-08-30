'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import { computePayroll } from '../payroll/actions';
import { salesTaxFromSettings, splitRevenue } from '@/lib/books/sales-tax';
import {
  summariseCosts, buildProfitAndLoss, expandRecurring,
  type CostedUsage, type CostType, type OperatingExpense, type ExpenseCategory,
} from '@/lib/books/cost-structure';

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
  /** What came through the till, tax included. Null until tax is configured. */
  grossTakings: number | null;
  /** Held for the state — never the bar's money. Null until configured. */
  salesTax: number | null;
  /** The configured rate, so the figure above can be shown with its basis. */
  salesTaxRatePct: number | null;
  /** True once a rate and a tax treatment are both set. */
  taxConfigured: boolean;
  /** Net of tax when configured; the raw POS figure when it is not. */
  revenue: number;
  tips: number;
  cogs: number;
  grossProfit: number;
  totalLabor: number;
  totalLosses: number;
  /** Net revenue with every deduction taken out — what the bar actually kept. */
  pureProfit: number;
  pureProfitPct: number | null;
  /** Beverage cost of sales only — the figure pour cost is measured on. */
  beverageCogs: number;
  foodCogs: number;
  /** Napkins, straws, cups. A real cost, kept out of pour cost. */
  supplies: number;
  operatingExpenses: number;
  expensesByCategory: { category: string; label: string; amount: number }[];
  pourCostPct: number | null;
  foodCostPct: number | null;
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
    { data: operatingExpenses },
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
      // cost_type comes through the item's category: it decides whether this
      // purchase is cost of goods, an operating supply, or ignored entirely.
      .select('quantity, reason, logged_at, inventory_items(cost_price, inventory_categories(cost_type))')
      .eq('organization_id', orgId)
      .eq('reason', 'delivery')
      .gte('logged_at', startDate + 'T00:00:00Z')
      .lte('logged_at', endDate + 'T23:59:59Z'),
    // Costs that never touch inventory: DJ, repairs, licences. Recurring rows
    // are fetched whole and expanded across the period below, so a monthly cost
    // entered once counts in every month it covers.
    supabase
      .from('operating_expenses')
      .select('category, amount, expense_date, is_recurring, recurring_until')
      .eq('organization_id', orgId)
      .lte('expense_date', endDate),
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

  // What the POS reported. Whether this already contains sales tax is a
  // configured fact, not something the figure itself reveals.
  const reportedSales = days.reduce((s, d) => s + (d.total_sales ?? 0), 0);
  const tips    = days.reduce((s, d) => s + (d.cash_tips ?? 0) + (d.cc_tips ?? 0), 0);

  const taxConfig = salesTaxFromSettings(org.bar_settings ?? {});

  function getCostPrice(raw: unknown): number {
    if (!raw) return 0;
    const obj = Array.isArray(raw) ? raw[0] : raw;
    return (obj as { cost_price?: number | null })?.cost_price ?? 0;
  }

  /** Reads the category's classification, defaulting to beverage cost of sales. */
  function getCostType(raw: unknown): CostType {
    if (!raw) return 'beverage_cogs';
    const item = (Array.isArray(raw) ? raw[0] : raw) as
      { inventory_categories?: unknown } | undefined;
    const cat = item?.inventory_categories;
    const catObj = Array.isArray(cat) ? cat[0] : cat;
    const t = (catObj as { cost_type?: string } | undefined)?.cost_type;
    return (['beverage_cogs', 'food_cogs', 'supplies', 'excluded'] as const).includes(t as CostType)
      ? (t as CostType)
      : 'beverage_cogs';
  }

  // Every purchase carries its category's classification, so napkins land in
  // supplies rather than inflating pour cost. See lib/books/cost-structure.ts.
  const costedUsage: CostedUsage[] = logs.map((l) => ({
    costType: getCostType(l.inventory_items),
    value: (l.quantity ?? 0) * getCostPrice(l.inventory_items),
  }));

  const rawExpenses: OperatingExpense[] = (operatingExpenses ?? []).map((e) => ({
    category: e.category as ExpenseCategory,
    amount: Number(e.amount) || 0,
    expenseDate: e.expense_date,
    isRecurring: e.is_recurring,
    recurringUntil: e.recurring_until,
  }));

  const costs = summariseCosts(
    costedUsage,
    expandRecurring(rawExpenses, startDate, endDate),
  );
  const cogs = costs.totalCogs;

  const totalLabor = payrollEntries.reduce((s, e) => s + e.regularPay + e.overtimePay, 0);

  const lossesBreakdown: LossesBreakdown = {
    voids:     lossRows.reduce((s, r) => s + (r.voids_amount ?? 0), 0),
    comps:     lossRows.reduce((s, r) => s + (r.comps_amount ?? 0), 0),
    spills:    lossRows.reduce((s, r) => s + (r.spills_amount ?? 0), 0),
    discounts: lossRows.reduce((s, r) => s + (r.discounts_amount ?? 0), 0),
  };
  const totalLosses = Object.values(lossesBreakdown).reduce((a, b) => a + b, 0);

  // Sales tax comes off the top before anything else. It is a liability the bar
  // is holding, not income — leaving it in would inflate revenue, gross profit,
  // every margin percentage, and the profit an owner judges the month by.
  const split = splitRevenue(reportedSales, taxConfig);
  const revenue = split.net;

  // The whole statement, from one function. There used to be two — this route
  // called buildProfitAndLoss AND a shorter computeProfit, displayed the
  // shorter one's bottom line under the longer one's rows, and so reported
  // profit high by exactly supplies plus operating expenses.
  const pnl = buildProfitAndLoss(revenue, costs, totalLabor, totalLosses);

  const grossProfit = pnl.grossProfit;

  // Monthly buckets
  const monthMap = new Map<string, { revenue: number; cogs: number; labor: number }>();

  for (const d of days) {
    const dt  = new Date(d.report_date + 'T00:00:00');
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap.has(key)) monthMap.set(key, { revenue: 0, cogs: 0, labor: 0 });
    // Split per month too, or the chart would plot tax-inclusive revenue
    // against tax-exclusive profit and the two lines would not reconcile.
    monthMap.get(key)!.revenue += splitRevenue(d.total_sales ?? 0, taxConfig).net;
  }

  for (const l of logs) {
    const dt  = new Date(l.logged_at as string);
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
    beverageCogs: pnl.beverageCogs,
    foodCogs: pnl.foodCogs,
    supplies: pnl.supplies,
    operatingExpenses: pnl.operatingExpenses,
    expensesByCategory: costs.expensesByCategory,
    pourCostPct: pnl.pourCostPct,
    foodCostPct: pnl.foodCostPct,
    grossTakings: split.gross,
    salesTax: split.tax,
    salesTaxRatePct: taxConfig.ratePct,
    taxConfigured: split.configured,
    pureProfit: pnl.pureProfit,
    pureProfitPct: pnl.pureProfitPct,
    revenue, tips, cogs, grossProfit, totalLabor, totalLosses,
    lossesBreakdown, monthlyData,
    grossMarginPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    laborPct:       revenue > 0 ? (totalLabor  / revenue) * 100 : 0,
  };
}
