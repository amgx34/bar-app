'use server';

/**
 * Sales reporting data.
 *
 * One loader for all three Sales screens: they ask the same question over the
 * same window and differ only in how they slice the answer. Loading once keeps
 * the totals on the overview and the rows on the category page from disagreeing.
 */
import { getCurrentOrg } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveDateRange, todayIso, type DateRange } from '@/lib/date-range';
import {
  computeItemMargins,
  groupByCategory,
  summariseSales,
  revenueTrend,
  type CostRef,
  type SoldLine,
  type ItemMargin,
  type CategoryMargin,
  type SalesSummary,
  type TrendPoint,
  type RecipeRef,
  topUncostedByRevenue,
  slowMovers,
  type SlowMover,
  type StockedItem,
} from '@/lib/pos/sales-analytics';
import { buildTokenTable, parseVariant } from '@/lib/pos/variants';

export type SalesData = {
  range: DateRange;
  summary: SalesSummary;
  categories: CategoryMargin[];
  items: ItemMargin[];
  trend: TrendPoint[];
  /**
   * True when the POS reports prices with tax included and the org has a rate
   * set. Revenue then contains money the bar never keeps, so every margin here
   * is overstated and the screens say so rather than quietly reporting it.
   */
  revenueIncludesTax: boolean;
  salesTaxRate: number;
  /** Uncosted items worth pricing first, by the revenue each explains. */
  topUncosted: ItemMargin[];
  /** What to stop ordering: dead stock first, then the slowest sellers. */
  slowMovers: SlowMover[];
};

export async function getSalesData(
  rangeKey?: string,
  from?: string,
  to?: string,
): Promise<SalesData> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();
  const orgId = org.id;

  const range = resolveDateRange(rangeKey, todayIso(), from, to);

  const settings = (org.bar_settings ?? {}) as {
    default_pour_oz?: number | null;
    pos_prices_include_tax?: boolean | null;
    sales_tax_rate?: number | null;
  };
  const orgPourOz = Number(settings.default_pour_oz) || null;

  const [{ data: sales }, { data: items }, { data: cats }] = await Promise.all([
    supabase
      .from('pos_item_sales')
      .select('match_key, base_match_key, size_token, item_name, category_name, qty_sold, net_sales, sale_date')
      .eq('organization_id', orgId)
      .gte('sale_date', range.from)
      .lte('sale_date', range.to),
    supabase
      .from('inventory_items')
      .select('id, name, cost_price, bottle_size_ml, pour_size_oz, category_id, current_stock')
      .eq('organization_id', orgId),
    supabase
      .from('inventory_categories')
      .select('id, name, default_pour_oz')
      .eq('organization_id', orgId),
  ]);

  // Recipes. A drink built from a recipe has no cost of its own — its stock row
  // is a phantom the ingest created from a POS name — so without this every
  // cocktail the bar has carefully configured reports as uncosted.
  const { data: bundles } = await supabase
    .from('pos_bundles')
    .select('match_key, is_active, pos_bundle_components(quantity, unit, inventory_item_id)')
    .eq('organization_id', orgId)
    .eq('is_active', true);

  // Size tokens. An org with no rows falls back to the four built-in ones, so
  // "DBL TITO'S" reports under Tito's at twice the pour without any setup.
  const { data: tokenRows } = await supabase
    .from('pos_size_tokens')
    .select('token, multiplier, label, mixer')
    .eq('organization_id', orgId);

  const sizeTokens = buildTokenTable(
    (tokenRows ?? []).map((t) => ({
      token: String(t.token),
      multiplier: Number(t.multiplier),
      label: String(t.label ?? ''),
      mixer: (t.mixer as string | null) ?? null,
    })),
  );

  const catPour = new Map(
    (cats ?? []).map((c) => [c.id as string, c.default_pour_oz as number | null]),
  );

  // Keyed the same way the ingest matches a POS line to an item: lower-cased
  // name. Anything else here would silently cost a different item.
  const costs = new Map<string, CostRef & { categoryPourOz: number | null }>();
  for (const i of items ?? []) {
    const key = String(i.name ?? '').toLowerCase().trim();
    if (!key) continue;
    costs.set(key, {
      matchKey: key,
      itemName: String(i.name ?? ''),
      costPrice: i.cost_price === null || i.cost_price === undefined ? null : Number(i.cost_price),
      bottleSizeMl: i.bottle_size_ml as number | null,
      pourSizeOz: i.pour_size_oz as number | null,
      categoryPourOz: i.category_id ? catPour.get(i.category_id as string) ?? null : null,
    });
  }

  const itemsById = new Map(
    (items ?? []).map((i) => [
      i.id as string,
      {
        costPrice: i.cost_price === null || i.cost_price === undefined ? null : Number(i.cost_price),
        bottleSizeMl: i.bottle_size_ml as number | null,
        pourSizeOz: (i.pour_size_oz as number | null) ??
          (i.category_id ? catPour.get(i.category_id as string) ?? null : null) ?? orgPourOz,
      },
    ]),
  );

  const lineKeys = new Set((sales ?? []).map((s2) => String(s2.match_key)));

  // Ingredient keys, so the reorder report does not call a fast-moving backbar
  // bottle dead stock. Built alongside the recipes from the same rows.
  const idToKey = new Map(
    (items ?? []).map((i) => [i.id as string, String(i.name ?? '').toLowerCase().trim()]),
  );
  const recipeIngredients = new Set<string>();

  const recipes = new Map<string, RecipeRef>();
  for (const b of bundles ?? []) {
    const comps = (b.pos_bundle_components ?? []) as {
      quantity: number; unit: string | null; inventory_item_id: string;
    }[];
    if (comps.length === 0) continue;
    // Only when the parent drink actually sold in this window. An ingredient
    // whose drink never rang up really is dead stock.
    if (lineKeys.has(String(b.match_key))) {
      for (const c of comps) {
        const key = idToKey.get(c.inventory_item_id);
        if (key) recipeIngredients.add(key);
      }
    }
    recipes.set(String(b.match_key), {
      matchKey: String(b.match_key),
      components: comps.map((c) => ({
        quantity: Number(c.quantity) || 0,
        unit: (c.unit as 'each' | 'oz') ?? 'each',
        item: itemsById.get(c.inventory_item_id) ?? {
          costPrice: null, bottleSizeMl: null, pourSizeOz: null,
        },
      })),
    });
  }

  const lines: SoldLine[] = (sales ?? []).map((s) => {
    const matchKey = String(s.match_key);
    // Rows written before the size-variant migration have no stored parse, and
    // the backfill only covered the four built-in tokens. Parsing here as a
    // fallback means a bar's custom token works on history too, without a
    // second backfill every time it adds one.
    const stored = (s.size_token as string | null) ?? null;
    const parsed = stored ? null : parseVariant(String(s.item_name ?? ''), sizeTokens);
    const token = stored ?? parsed?.sizeToken ?? null;
    const def = token ? sizeTokens.get(token) : undefined;

    return {
      matchKey,
      itemName: String(s.item_name ?? s.match_key),
      categoryName: (s.category_name as string | null) ?? null,
      qtySold: Number(s.qty_sold) || 0,
      netSales: Number(s.net_sales) || 0,
      saleDate: String(s.sale_date),
      baseMatchKey: (s.base_match_key as string | null)
        ?? parsed?.baseMatchKey
        ?? matchKey,
      sizeToken: token,
      // Resolved from the token table, never stored on the row: a bar that
      // corrects a multiplier must not have to rewrite its sales history.
      sizeMultiplier: def?.multiplier ?? 1,
      sizeLabel: def?.label ?? null,
    };
  });

  // The pour chain is item -> category -> org, so the category default has to
  // travel with each item rather than being applied globally.
  const perItemDefaults = new Map(
    [...costs.entries()].map(([k, v]) => [k, { categoryPourOz: v.categoryPourOz, orgPourOz }]),
  );
  const costRefs = new Map<string, CostRef>(
    [...costs.entries()].map(([k, v]) => [k, v as CostRef]),
  );

  // computeItemMargins takes one defaults object, so items whose category
  // overrides the org pour are resolved by folding that override onto the item
  // itself first. Same result, and it keeps the pure function simple.
  for (const [key, ref] of costRefs) {
    const d = perItemDefaults.get(key);
    if (ref.pourSizeOz == null && d?.categoryPourOz) {
      costRefs.set(key, { ...ref, pourSizeOz: d.categoryPourOz });
    }
  }

  const catName = new Map((cats ?? []).map((c) => [c.id as string, (c.name as string) ?? null]));
  const stocked: StockedItem[] = (items ?? []).map((i) => ({
    matchKey: String(i.name ?? '').toLowerCase().trim(),
    itemName: String(i.name ?? ''),
    categoryName: i.category_id ? catName.get(i.category_id as string) ?? null : null,
    currentStock: i.current_stock === null || i.current_stock === undefined ? null : Number(i.current_stock),
    costPrice: i.cost_price === null || i.cost_price === undefined ? null : Number(i.cost_price),
  }));

  const itemMargins = computeItemMargins(lines, costRefs, { orgPourOz }, recipes);

  return {
    range,
    summary: summariseSales(itemMargins),
    categories: groupByCategory(itemMargins),
    items: itemMargins,
    trend: revenueTrend(lines, costRefs, { orgPourOz }, recipes),
    revenueIncludesTax:
      settings.pos_prices_include_tax === true && Number(settings.sales_tax_rate) > 0,
    salesTaxRate: Number(settings.sales_tax_rate) || 0,
    topUncosted: topUncostedByRevenue(itemMargins, 4),
    // Built from inventory, not sales: an item that never rang up is absent
    // from pos_item_sales entirely, and those are the ones worth knowing about.
    slowMovers: slowMovers(itemMargins, stocked, { consumedByRecipe: recipeIngredients, limit: 10 }),
  };
}
