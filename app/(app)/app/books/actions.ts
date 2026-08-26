'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import { computePayroll } from '../payroll/actions';
import { computeProfit, salesTaxFromSettings, splitRevenue } from '@/lib/books/sales-tax';
import {
  summariseCosts, buildProfitAndLoss, expandRecurring,
  type CostedUsage, type CostType, type OperatingExpense, type ExpenseCategory,
} from '@/lib/books/cost-structure';
import { allocateShipmentCharges } from '@/lib/inventory/shipments';

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
  netOperating: number;
  totalLosses: number;
  netProfit: number;
  netProfitPct: number;
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
    { data: voidedShipments },
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
      // unit_cost is what the invoice actually charged; NULL for every delivery
      // recorded before shipments existed, which is why the fallback stays.
      .select('quantity, reason, logged_at, unit_cost, shipment_id, inventory_items(cost_price, inventory_categories(cost_type))')
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
    // Shipment ids voided at any time, not just within [startDate, endDate].
    // voidShipment() reverses stock but deliberately leaves the original
    // `delivery` usage_logs rows in place (so the paper trail of what was
    // received still exists), so those rows must be kept out of costedUsage
    // by hand here. A shipment received in August and voided in September
    // still has to disappear from August's P&L, so this query is
    // deliberately NOT filtered by invoice_date — filtering it to the
    // reporting window would let a late void keep the voided invoice's value
    // in a month that has already closed.
    supabase
      .from('inventory_shipments')
      .select('id')
      .eq('organization_id', orgId)
      .not('voided_at', 'is', null),
    computePayroll(startDate, endDate),
  ]);

  const days = zDays ?? [];
  const logs = usageLogs ?? [];
  const lossRows = losses ?? [];
  // Rows with no shipment_id (every historical delivery, and manual stock
  // adjustments) are never voided by this check and still count in full.
  const voidedShipmentIds = new Set((voidedShipments ?? []).map((s) => s.id));

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
  //
  // unit_cost is what the invoice charged. Falling back to the item's current
  // cost_price is what every delivery did before shipments existed — and is
  // also why editing an item used to restate history: with no record of what a
  // delivery cost, last month's purchases were re-priced at today's price.
  //
  // A row whose shipment was voided is dropped here: voidShipment() reverses
  // the stock but leaves the row itself in place as a record, so without this
  // filter a voided invoice would still count at full value even though the
  // stock it bought is gone. Rows with no shipment_id (all history predating
  // shipments, plus manual adjustments) never match a voided id and pass
  // through untouched.
  const costedUsage: CostedUsage[] = logs
    .filter((l) => !l.shipment_id || !voidedShipmentIds.has(l.shipment_id))
    .map((l) => ({
      costType: getCostType(l.inventory_items),
      value: (l.quantity ?? 0) * (l.unit_cost ?? getCostPrice(l.inventory_items)),
    }));

  const rawExpenses: OperatingExpense[] = (operatingExpenses ?? []).map((e) => ({
    category: e.category as ExpenseCategory,
    amount: Number(e.amount) || 0,
    expenseDate: e.expense_date,
    isRecurring: e.is_recurring,
    recurringUntil: e.recurring_until,
  }));

  // Freight and tax are invoice-level but pour cost is per category, so each
  // shipment's charges are spread across its own lines by share of value. A
  // case of napkins on a liquor invoice must not carry the same freight as ten
  // cases of spirits. Deposits are excluded — they come back.
  //
  // .is('voided_at', null) here means a voided shipment's charges are simply
  // never fetched, which is enough for the charges themselves — but it does
  // NOT touch the underlying usage_logs lines, which is why costedUsage above
  // needs its own voidedShipmentIds filter.
  const { data: shipmentCharges } = await supabase
    .from('inventory_shipments')
    .select('id, freight, tax, other_charges')
    .eq('organization_id', orgId)
    .is('voided_at', null)
    .gte('invoice_date', startDate)
    .lte('invoice_date', endDate);

  const chargedUsage: CostedUsage[] = [];
  for (const shipment of shipmentCharges ?? []) {
    const shipmentLines = logs
      .filter((l) => l.shipment_id === shipment.id)
      .map((l) => ({
        costType: getCostType(l.inventory_items),
        lineTotal: (l.quantity ?? 0) * (l.unit_cost ?? getCostPrice(l.inventory_items)),
      }));

    const { byLine } = allocateShipmentCharges(shipmentLines, {
      freight: Number(shipment.freight) || 0,
      tax: Number(shipment.tax) || 0,
      otherCharges: Number(shipment.other_charges) || 0,
    });

    byLine.forEach((value, i) => {
      if (value > 0) chargedUsage.push({ costType: shipmentLines[i].costType, value });
    });
  }

  const costs = summariseCosts(
    [...costedUsage, ...chargedUsage],
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
  // every margin percentage, and the net figure an owner judges the month by.
  const profit = computeProfit(reportedSales, cogs, totalLabor, taxConfig);
  const revenue = profit.netRevenue;

  // The full hospitality line: COGS above gross profit, supplies and overheads
  // below it, so pour cost stays comparable to an industry benchmark.
  const pnl = buildProfitAndLoss(profit.netRevenue, costs, totalLabor, totalLosses);

  const grossProfit  = profit.grossProfit;
  // Losses are deducted here but not inside computeProfit, which models the
  // standard revenue - COGS - labour line. Voids and comps are a separate
  // operational leak that this page reports on its own terms.
  const netOperating = grossProfit - totalLabor - totalLosses;

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
    grossTakings: profit.grossTakings,
    salesTax: profit.salesTax,
    salesTaxRatePct: taxConfig.ratePct,
    taxConfigured: profit.taxConfigured,
    netProfit: profit.netProfit,
    netProfitPct: profit.netProfitPct,
    revenue, tips, cogs, grossProfit, totalLabor, netOperating, totalLosses,
    lossesBreakdown, monthlyData,
    grossMarginPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    laborPct:       revenue > 0 ? (totalLabor  / revenue) * 100 : 0,
  };
}
