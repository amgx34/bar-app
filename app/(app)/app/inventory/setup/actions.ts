'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';
import { posItemMatchKey } from '@/lib/pos/excluded-items';
import { resolvePourOz } from '@/lib/pos/pour';
import {
  findSetupGaps,
  summariseGaps,
  type SetupGap,
  type GapSummary,
  type InventoryRef,
} from '@/lib/pos/setup-gaps';

/**
 * The stock-tracking work list.
 *
 * Deliberately its own action rather than a field on the analytics payload.
 * Analytics answers "how is the bar trading"; this answers "can the bar trust
 * those numbers at all", and loading a whole shrinkage-and-velocity report to
 * show a configuration checklist made both screens slower and muddier.
 *
 * Four queries, all of them needed: what sold, what is in inventory, which
 * names already resolve to a recipe, and the org-wide pour fallback.
 */

const WINDOW_DAYS = 30;

export type SetupGapsData = {
  gaps: SetupGap[];
  summary: GapSummary;
  windowDays: number;
};

function categoryPourOz(raw: unknown): number | null {
  if (!raw) return null;
  const obj = Array.isArray(raw) ? raw[0] : raw;
  const n = Number((obj as { default_pour_oz?: number | null } | undefined)?.default_pour_oz);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function getSetupGaps(): Promise<SetupGapsData> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();
  const orgId = org.id;

  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);
  const sinceDate = since.toISOString().split('T')[0];

  const [{ data: sales }, { data: items }, { data: bundles }] = await Promise.all([
    supabase
      .from('pos_item_sales')
      .select('match_key, item_name, category_name, qty_sold, net_sales')
      .eq('organization_id', orgId)
      .gte('sale_date', sinceDate),
    supabase
      .from('inventory_items')
      .select('name, bottle_size_ml, pour_size_oz, inventory_categories(default_pour_oz)')
      .eq('organization_id', orgId)
      .eq('is_active', true),
    supabase
      .from('pos_bundles')
      .select('match_key')
      .eq('organization_id', orgId)
      .eq('is_active', true),
  ]);

  const orgPourOz =
    Number((org.bar_settings as { default_pour_oz?: number } | null)?.default_pour_oz) || null;

  // Aggregated by match_key: pos_item_sales holds one row per (day, item), and
  // the question here is about the item, not the night.
  const soldByKey = new Map<
    string,
    { itemName: string; matchKey: string; categoryName: string | null; qtySold: number; revenue: number }
  >();

  for (const row of sales ?? []) {
    const key = row.match_key as string;
    const existing = soldByKey.get(key);
    if (existing) {
      existing.qtySold += Number(row.qty_sold) || 0;
      existing.revenue += Number(row.net_sales) || 0;
      // Keep the first non-null category: the POS occasionally omits it on a
      // line, and a null would make the item look unclassifiable.
      existing.categoryName ??= (row.category_name as string | null) ?? null;
    } else {
      soldByKey.set(key, {
        itemName: (row.item_name as string) ?? key,
        matchKey: key,
        categoryName: (row.category_name as string | null) ?? null,
        qtySold: Number(row.qty_sold) || 0,
        revenue: Number(row.net_sales) || 0,
      });
    }
  }

  const inventoryByKey = new Map<string, InventoryRef>(
    (items ?? []).map((i) => {
      const key = posItemMatchKey(i.name as string);
      return [
        key,
        {
          matchKey: key,
          bottleSizeMl: (i.bottle_size_ml as number | null) ?? null,
          // Resolved through item -> category -> org, so an item with no pour
          // of its own is not reported as broken when its category supplies one.
          resolvedPourOz: resolvePourOz(
            {
              bottleSizeMl: (i.bottle_size_ml as number | null) ?? null,
              pourSizeOz: (i.pour_size_oz as number | null) ?? null,
            },
            { categoryPourOz: categoryPourOz(i.inventory_categories), orgPourOz },
          ),
        },
      ];
    }),
  );

  const gaps = findSetupGaps(
    [...soldByKey.values()],
    inventoryByKey,
    new Set((bundles ?? []).map((b) => b.match_key as string)),
  );

  return { gaps, summary: summariseGaps(gaps), windowDays: WINDOW_DAYS };
}
