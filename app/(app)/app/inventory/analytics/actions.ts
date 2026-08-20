'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';
import { posItemMatchKey } from '@/lib/pos/excluded-items';
import { computeVelocity } from '@/lib/pos/velocity';
import { unitsPerSale } from '@/lib/pos/pour';

const OZ_PER_ML = 0.033814;

/** The category's default pour, when the join returned one. */
function getCatPourOz(raw: unknown): number | null {
  if (!raw) return null;
  const obj = Array.isArray(raw) ? raw[0] : raw;
  const n = Number((obj as { default_pour_oz?: number | null } | undefined)?.default_pour_oz);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getCatName(raw: unknown): string {
  if (!raw) return 'Uncategorized';
  const obj = Array.isArray(raw) ? raw[0] : raw;
  return (obj as { name?: string })?.name ?? 'Uncategorized';
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Movements that ADD stock rather than consume it. A POS reversal lands here
// because it only ever fires when the POS restates a day downward — treating it
// as consumption would inflate velocity every time a void was corrected.
// `pos_sale` is deliberately absent: a POS sale is consumption, which is the
// whole point of depleting stock from the item audit.
const NON_CONSUMPTION_REASONS = new Set(['delivery', 'pos_reversal']);

const SHRINKAGE_REASONS = new Set(['spillage', 'comp', 'staff_drink', 'recount']);
const REASON_LABELS: Record<string, string> = {
  spillage:    'Spillage',
  comp:        'Comps',
  staff_drink: 'Staff Drinks',
  recount:     'Recount / Loss',
};

export type CategoryBreakdown = { category: string; itemCount: number; totalValue: number; lowCount: number; consumption30d: number; };
export type VelocityItem      = { id: string; name: string; category: string; dailyUsage: number; currentStock: number; parLevel: number | null; daysRemaining: number | null; suggestedReorder: number; };
export type AlertItem         = VelocityItem & { urgency: 'critical' | 'high' | 'medium'; };
export type TopValueItem      = { name: string; category: string; currentStock: number; costPrice: number; stockValue: number; };
export type ShrinkageRow      = { reason: string; quantity: number; estimatedCost: number; };
export type MonthlyShrinkage  = { month: string; quantity: number; estimatedCost: number; };
export type PourCostItem      = { name: string; category: string; bottleSizeMl: number; pourSizeOz: number; costPrice: number; costPerPour: number; costPerOz: number; };

export type AnalyticsData = {
  totalInventoryValue: number; lowStockCount: number; outOfStockCount: number;
  totalActiveItems: number; parCompliancePct: number; totalShrinkageCost30d: number; avgPourCost: number;
  categoryBreakdown: CategoryBreakdown[]; fastMovers: VelocityItem[]; slowMovers: VelocityItem[];
  predictiveAlerts: AlertItem[]; topValueItems: TopValueItem[];
  shrinkageByReason: ShrinkageRow[]; monthlyShrinkage: MonthlyShrinkage[]; pourCosts: PourCostItem[];
};

export async function getAnalyticsData(): Promise<AnalyticsData> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();
  const orgId = org.id;
  const now = new Date();
  const d30 = new Date(now); d30.setDate(now.getDate() - 30);
  const d90 = new Date(now); d90.setDate(now.getDate() - 90);

  const [{ data: rawItems }, { data: logs30 }, { data: logs90 }, { data: posSales30 }] = await Promise.all([
    supabase.from('inventory_items').select('id, name, unit, current_stock, par_level, cost_price, bottle_size_ml, pour_size_oz, inventory_categories(name, default_pour_oz)').eq('organization_id', orgId).eq('is_active', true).order('name'),
    supabase.from('usage_logs').select('item_id, quantity, reason, logged_at').eq('organization_id', orgId).gte('logged_at', d30.toISOString()),
    supabase.from('usage_logs').select('item_id, quantity, reason, logged_at').eq('organization_id', orgId).gte('logged_at', d90.toISOString()),
    // What actually SOLD. Velocity used to read usage_logs alone, so a bar that
    // syncs its POS but does not hand-log spillage had no movers at all — the
    // sales sat unused in pos_item_sales. See lib/pos/velocity.ts.
    supabase.from('pos_item_sales').select('match_key, qty_sold, net_sales, sale_date').eq('organization_id', orgId).gte('sale_date', d30.toISOString().split('T')[0]),
  ]);

  const items = rawItems ?? [];
  type ItemInfo = { name: string; category: string; currentStock: number; parLevel: number | null; costPrice: number | null; bottleSizeMl: number | null; pourSizeOz: number | null; unit: string; };
  const itemMap = new Map<string, ItemInfo>();
  for (const item of items) {
    itemMap.set(item.id, { name: item.name, category: getCatName(item.inventory_categories), currentStock: item.current_stock ?? 0, parLevel: item.par_level ?? null, costPrice: item.cost_price ?? null, bottleSizeMl: item.bottle_size_ml ?? null, pourSizeOz: item.pour_size_oz ?? null, unit: item.unit ?? '' });
  }

  const totalInventoryValue = items.reduce((s, i) => s + (i.current_stock ?? 0) * (i.cost_price ?? 0), 0);
  const itemsWithPar  = items.filter((i) => i.par_level !== null && i.par_level > 0);
  const lowStockCount = itemsWithPar.filter((i) => i.current_stock < i.par_level!).length;
  const outOfStockCount = items.filter((i) => i.current_stock === 0).length;
  const parCompliancePct = itemsWithPar.length > 0 ? ((itemsWithPar.length - lowStockCount) / itemsWithPar.length) * 100 : 100;

  const catMap = new Map<string, CategoryBreakdown>();
  for (const item of items) {
    const cat = getCatName(item.inventory_categories);
    if (!catMap.has(cat)) catMap.set(cat, { category: cat, itemCount: 0, totalValue: 0, lowCount: 0, consumption30d: 0 });
    const e = catMap.get(cat)!;
    e.itemCount++;
    e.totalValue += (item.current_stock ?? 0) * (item.cost_price ?? 0);
    if (item.par_level !== null && item.current_stock < item.par_level) e.lowCount++;
  }
  for (const log of logs30 ?? []) {
    if (NON_CONSUMPTION_REASONS.has(log.reason)) continue;
    const info = itemMap.get(log.item_id);
    if (info) { const e = catMap.get(info.category); if (e) e.consumption30d += log.quantity ?? 0; }
  }
  const categoryBreakdown = [...catMap.values()].sort((a, b) => b.totalValue - a.totalValue);

  // Sold + lost, with pos_sale logs excluded from the loss side so a sold unit
  // is never counted twice once depletion is running.
  // The org-wide pour, last link of the item -> category -> organisation chain.
  const orgPourOz = Number(
    (org.bar_settings as { default_pour_oz?: number } | null)?.default_pour_oz,
  ) || null;

  const velocity = computeVelocity(
    items.map((i) => ({
      id: i.id,
      name: i.name,
      matchKey: posItemMatchKey(i.name),
      // Without this, drinks sold were added to stock lost as though a shot
      // were a bottle, and daysRemaining below came out ~17x too short.
      unitsPerSale: unitsPerSale(
        { bottleSizeMl: i.bottle_size_ml ?? null, pourSizeOz: i.pour_size_oz ?? null },
        { categoryPourOz: getCatPourOz(i.inventory_categories), orgPourOz },
      ),
    })),
    (posSales30 ?? []).map((s) => ({
      matchKey: s.match_key,
      qtySold: Number(s.qty_sold) || 0,
      netSales: Number(s.net_sales) || 0,
      saleDate: s.sale_date,
    })),
    (logs30 ?? []).map((l) => ({
      itemId: l.item_id,
      quantity: Number(l.quantity) || 0,
      reason: l.reason,
    })),
    30,
  );
  const velocityByItem = new Map(velocity.map((v) => [v.itemId, v]));

  const velocityItems: VelocityItem[] = items.map((item) => {
    const dailyUsage = velocityByItem.get(item.id)?.dailyUsage ?? 0;
    const currentStock = item.current_stock ?? 0;
    const parLevel = item.par_level ?? null;
    const daysRemaining = dailyUsage > 0 ? Math.floor(currentStock / dailyUsage) : null;
    const deficit = parLevel !== null ? Math.max(0, parLevel - currentStock) : 0;
    return { id: item.id, name: item.name, category: getCatName(item.inventory_categories), dailyUsage, currentStock, parLevel, daysRemaining, suggestedReorder: deficit + Math.ceil(dailyUsage * 7) };
  });

  const fastMovers = [...velocityItems].filter((i) => i.dailyUsage > 0).sort((a, b) => b.dailyUsage - a.dailyUsage).slice(0, 10);
  const slowMovers = [...velocityItems].filter((i) => i.dailyUsage === 0 && i.currentStock > 0).sort((a, b) => (b.currentStock * (itemMap.get(b.id)?.costPrice ?? 0)) - (a.currentStock * (itemMap.get(a.id)?.costPrice ?? 0))).slice(0, 8);
  const predictiveAlerts: AlertItem[] = velocityItems.filter((i) => i.currentStock === 0 || (i.parLevel !== null && i.currentStock < i.parLevel) || (i.daysRemaining !== null && i.daysRemaining <= 7)).map((i) => ({ ...i, urgency: (i.currentStock === 0 ? 'critical' : (i.daysRemaining !== null && i.daysRemaining <= 3) ? 'high' : 'medium') as AlertItem['urgency'] })).sort((a, b) => { const o = { critical: 0, high: 1, medium: 2 }; return o[a.urgency] - o[b.urgency] || b.dailyUsage - a.dailyUsage; }).slice(0, 12);

  const topValueItems: TopValueItem[] = items.filter((i) => i.cost_price !== null && i.cost_price > 0).map((i) => ({ name: i.name, category: getCatName(i.inventory_categories), currentStock: i.current_stock ?? 0, costPrice: i.cost_price!, stockValue: (i.current_stock ?? 0) * i.cost_price! })).sort((a, b) => b.stockValue - a.stockValue).slice(0, 10);

  const reasonMap = new Map<string, ShrinkageRow>();
  const monthMap  = new Map<string, MonthlyShrinkage>();
  for (const log of logs90 ?? []) {
    if (!SHRINKAGE_REASONS.has(log.reason)) continue;
    const info = itemMap.get(log.item_id);
    const qty = log.quantity ?? 0; const cost = qty * (info?.costPrice ?? 0);
    const label = REASON_LABELS[log.reason] ?? log.reason;
    if (!reasonMap.has(label)) reasonMap.set(label, { reason: label, quantity: 0, estimatedCost: 0 });
    reasonMap.get(label)!.quantity += qty; reasonMap.get(label)!.estimatedCost += cost;
    const dt = new Date(log.logged_at as string);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap.has(key)) monthMap.set(key, { month: '', quantity: 0, estimatedCost: 0 });
    monthMap.get(key)!.quantity += qty; monthMap.get(key)!.estimatedCost += cost;
  }
  const shrinkageByReason = [...reasonMap.values()].sort((a, b) => b.estimatedCost - a.estimatedCost);
  const monthlyShrinkage = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => { const [yr, mo] = key.split('-').map(Number); return { ...v, month: `${MONTHS[mo - 1]} ${yr}` }; });
  const totalShrinkageCost30d = (logs30 ?? []).reduce((s, log) => { if (!SHRINKAGE_REASONS.has(log.reason)) return s; const info = itemMap.get(log.item_id); return s + (log.quantity ?? 0) * (info?.costPrice ?? 0); }, 0);

  const pourCosts: PourCostItem[] = items.filter((i) => i.bottle_size_ml && i.pour_size_oz && i.cost_price).map((i) => { const bottleOz = i.bottle_size_ml! * OZ_PER_ML; const costPerOz = i.cost_price! / bottleOz; return { name: i.name, category: getCatName(i.inventory_categories), bottleSizeMl: i.bottle_size_ml!, pourSizeOz: i.pour_size_oz!, costPrice: i.cost_price!, costPerPour: costPerOz * i.pour_size_oz!, costPerOz }; }).sort((a, b) => b.costPerPour - a.costPerPour).slice(0, 12);
  const avgPourCost = pourCosts.length > 0 ? pourCosts.reduce((s, p) => s + p.costPerPour, 0) / pourCosts.length : 0;

  return { totalInventoryValue, lowStockCount, outOfStockCount, totalActiveItems: items.length, parCompliancePct, totalShrinkageCost30d, avgPourCost, categoryBreakdown, fastMovers, slowMovers, predictiveAlerts, topValueItems, shrinkageByReason, monthlyShrinkage, pourCosts };
}
