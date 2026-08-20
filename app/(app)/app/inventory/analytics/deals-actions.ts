'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';
import { componentUnits, unitsPerSale } from '@/lib/pos/pour';
import {
  computeDealPerformance,
  summariseDeals,
  type DealDefinition,
  type DealPerformance,
  type DealsSummary,
  type SalesFact,
} from '@/lib/pos/deal-performance';

export type DealsAnalytics = {
  performance: DealPerformance[];
  summary: DealsSummary;
  /** Days of POS history actually available, which bounds every figure here. */
  daysOfData: number;
  periodStart: string | null;
  periodEnd: string | null;
  /**
   * Deals the POS is selling that have no recipe yet. Named so the operator can
   * turn the biggest ones into bundles rather than hunting for them.
   */
  candidates: { name: string; unitsSold: number; revenue: number }[];
};

/** How far back to look. Matches the rest of the analytics page. */
const WINDOW_DAYS = 30;

/**
 * Deal performance for the inventory analytics page.
 *
 * Everything is derived from three things the app already stores: the recipe
 * (`pos_bundles`), what the POS rang up (`pos_item_sales`), and what the
 * components cost (`inventory_items.cost_price`). No new ingest is needed —
 * the sales facts have been accumulating since the bundles migration.
 */
export async function getDealsAnalytics(): Promise<DealsAnalytics> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);
  const sinceIso = since.toISOString().split('T')[0];

  const [{ data: bundleRows }, { data: salesRows }] = await Promise.all([
    supabase
      .from('pos_bundles')
      .select('id, item_name, match_key, is_active, pos_bundle_components(inventory_item_id, quantity, unit)')
      .eq('organization_id', org.id),
    supabase
      .from('pos_item_sales')
      .select('sale_date, match_key, item_name, qty_sold, net_sales, is_bundle')
      .eq('organization_id', org.id)
      .gte('sale_date', sinceIso),
  ]);

  const bundles = bundleRows ?? [];
  const sales = salesRows ?? [];

  // Costs for every component referenced by a recipe, in one query.
  const componentIds = [
    ...new Set(
      bundles.flatMap((b) =>
        (b.pos_bundle_components ?? []).map((c) => c.inventory_item_id as string),
      ),
    ),
  ];

  const { data: items } = componentIds.length
    ? await supabase
        .from('inventory_items')
        .select('id, name, cost_price, sale_price, bottle_size_ml, pour_size_oz')
        .eq('organization_id', org.id)
        .in('id', componentIds)
    : { data: [] };

  const itemById = new Map((items ?? []).map((i) => [i.id, i]));

  const deals: DealDefinition[] = bundles.map((b) => ({
    bundleId: b.id,
    name: b.item_name,
    matchKey: b.match_key,
    isActive: b.is_active,
    components: (b.pos_bundle_components ?? []).map((c) => {
      const item = itemById.get(c.inventory_item_id as string);
      const pourItem = {
        bottleSizeMl: item?.bottle_size_ml === null || item?.bottle_size_ml === undefined
          ? null
          : Number(item.bottle_size_ml),
        pourSizeOz: item?.pour_size_oz === null || item?.pour_size_oz === undefined
          ? null
          : Number(item.pour_size_oz),
      };

      // The recipe's unit was being ignored here, so an 'oz' component costed
      // its OUNCES at the per-bottle price: 1.5 oz of a $20 bottle read as $30
      // rather than $1.18, and every cocktail deal looked like it sold below
      // cost. componentUnits is the same conversion depletion uses.
      const stockUnits = componentUnits(
        Number(c.quantity),
        (c.unit as 'each' | 'oz') ?? 'each',
        pourItem,
      );

      // What the components would ring up as individually, for the a-la-carte
      // comparison. sale_price is per DRINK, so stock units have to be turned
      // back into a number of drinks before multiplying by it.
      const perSale = unitsPerSale(pourItem);
      const servings = perSale > 0 ? stockUnits / perSale : stockUnits;

      return {
        inventoryItemId: c.inventory_item_id as string,
        itemName: item?.name ?? 'Unknown item',
        quantity: stockUnits,
        servings,
        // Null, never 0: a missing cost must read as "unknown" so margin is
        // withheld rather than reported as 100%.
        costPrice: item?.cost_price === null || item?.cost_price === undefined
          ? null
          : Number(item.cost_price),
        salePrice: item?.sale_price === null || item?.sale_price === undefined
          ? null
          : Number(item.sale_price),
      };
    }),
  }));

  const facts: SalesFact[] = sales.map((s) => ({
    saleDate: s.sale_date,
    matchKey: s.match_key,
    qtySold: Number(s.qty_sold),
    netSales: Number(s.net_sales),
  }));

  const performance = computeDealPerformance(deals, facts);
  const totalPosRevenue = facts.reduce((sum, f) => sum + f.netSales, 0);
  const summary = summariseDeals(performance, totalPosRevenue);

  const dates = [...new Set(sales.map((s) => s.sale_date))].sort();

  // Things that look like deals but have no recipe. Same wording heuristic the
  // settings panel uses, applied to what is actually SELLING rather than to the
  // inventory list — so the suggestions are ranked by how much they matter.
  const DEAL_HINTS = [
    /\bbucket\b/i, /\b\d+\s*(for|4)\s*\d+\b/i, /\bcombo\b/i, /\bdeal\b/i,
    /\bspecial\b/i, /\bhappy\s*hour\b/i, /\bpitcher\b/i, /\bround\b/i,
    /\bpackage\b/i, /\bhalf\s*price\b/i,
  ];
  const defined = new Set(deals.map((d) => d.matchKey));
  const candidateTotals = new Map<string, { name: string; unitsSold: number; revenue: number }>();

  for (const s of sales) {
    if (defined.has(s.match_key)) continue;
    if (!DEAL_HINTS.some((re) => re.test(s.item_name))) continue;
    const existing = candidateTotals.get(s.match_key);
    if (existing) {
      existing.unitsSold += Number(s.qty_sold);
      existing.revenue += Number(s.net_sales);
    } else {
      candidateTotals.set(s.match_key, {
        name: s.item_name,
        unitsSold: Number(s.qty_sold),
        revenue: Number(s.net_sales),
      });
    }
  }

  return {
    performance,
    summary,
    daysOfData: dates.length,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
    candidates: [...candidateTotals.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6),
  };
}
