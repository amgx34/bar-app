'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';
import { canEditInventory } from '@/lib/permissions';
import { posItemMatchKey } from '@/lib/pos/excluded-items';

export type BundleComponentRow = {
  inventory_item_id: string;
  item_name: string;
  quantity: number;
  unit: 'each' | 'oz';
};

export type BundleRow = {
  id: string;
  item_name: string;
  is_active: boolean;
  components: BundleComponentRow[];
};

export type InventoryOption = {
  id: string;
  name: string;
  unit: string;
};

const componentSchema = z.object({
  inventory_item_id: z.string().uuid(),
  // Fractional on purpose: a pitcher is a real fraction of a keg.
  quantity: z.number().positive('Quantity must be greater than zero').max(1000),
  /**
   * 'each' = whole stock units, as the bar counts them. 'oz' = a measured pour,
   * converted through the item's bottle size — which is what makes a mixed
   * drink expressible. Defaults to 'each' so existing recipes are unchanged.
   */
  unit: z.enum(['each', 'oz']).default('each'),
});

const bundleSchema = z.object({
  id: z.string().uuid().optional(),
  item_name: z
    .string()
    .trim()
    .min(1, 'Enter the deal name exactly as the POS reports it')
    .max(200),
  components: z
    .array(componentSchema)
    .min(1, 'A deal needs at least one component')
    .max(50),
});

export async function listBundles(): Promise<BundleRow[]> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('pos_bundles')
    .select(
      'id, item_name, is_active, pos_bundle_components(inventory_item_id, quantity, unit, inventory_items(name))',
    )
    .eq('organization_id', org.id)
    .order('item_name');

  return (data ?? []).map((b) => ({
    id: b.id,
    item_name: b.item_name,
    is_active: b.is_active,
    components: (b.pos_bundle_components ?? []).map((c) => {
      // Supabase types an embedded to-one relation as an object, but returns an
      // array shape in some query plans; normalise rather than trust either.
      const joined = c.inventory_items as unknown;
      const item = Array.isArray(joined) ? joined[0] : joined;
      return {
        inventory_item_id: c.inventory_item_id,
        item_name: (item as { name?: string })?.name ?? 'Unknown item',
        quantity: Number(c.quantity),
        unit: (c.unit === 'oz' ? 'oz' : 'each') as 'each' | 'oz',
      };
    }),
  }));
}

/** Active stock items, for the component picker. */
export async function listInventoryOptions(): Promise<InventoryOption[]> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('inventory_items')
    .select('id, name, unit')
    .eq('organization_id', org.id)
    .eq('is_active', true)
    .order('name');

  return (data ?? []) as InventoryOption[];
}

/**
 * Creates or replaces a deal recipe.
 *
 * Three things happen beyond the obvious write, each of which the feature is
 * broken without:
 *
 *  1. Any exclusion for the same name is removed. The ingest route filters
 *     exclusions BEFORE it resolves bundles, so a deal that is both excluded and
 *     bundled would never expand — the recipe would sit in the UI looking
 *     correct and silently do nothing.
 *
 *  2. The phantom inventory item the deal already created is deactivated. A
 *     bar that has been syncing for months already has "Bucket of 5 Domestic"
 *     sitting in stock; defining the recipe should retire it, not leave it
 *     beside the components it now depletes.
 *
 *  3. Components are replaced wholesale rather than merged, so removing an
 *     ingredient from the recipe actually removes it.
 */
export async function saveBundle(raw: unknown): Promise<{
  id: string;
  unexcluded: boolean;
  deactivated: number;
}> {
  const { org, role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const input = bundleSchema.parse(raw);
  const supabase = createAdminClient();
  const matchKey = posItemMatchKey(input.item_name);

  // A component list naming the same item twice would violate the UNIQUE
  // constraint on (bundle_id, inventory_item_id); sum instead of failing, which
  // is what someone adding "Well Vodka x1" twice meant anyway.
  // Keyed by item AND unit: adding "2 each" to "0.5 oz" would be adding two
  // different measures, and the result would be neither.
  const merged = new Map<string, { itemId: string; unit: 'each' | 'oz'; quantity: number }>();
  for (const c of input.components) {
    const key = `${c.inventory_item_id}|${c.unit}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += c.quantity;
    else merged.set(key, { itemId: c.inventory_item_id, unit: c.unit, quantity: c.quantity });
  }

  // Guard against a recipe that consumes the deal itself, which would make the
  // resolver deplete a phantom item forever.
  const { data: ownItems } = await supabase
    .from('inventory_items')
    .select('id, name')
    .eq('organization_id', org.id)
    .in('id', [...new Set([...merged.values()].map((m) => m.itemId))]);

  for (const item of ownItems ?? []) {
    if (posItemMatchKey(item.name) === matchKey) {
      throw new Error('A deal cannot list itself as one of its own components');
    }
  }

  // Every component must belong to this org. The ids arrive from the browser,
  // so this is the gate — pos_bundle_components has no organization_id of its
  // own to filter on later.
  const distinctItemIds = new Set([...merged.values()].map((m) => m.itemId));
  if ((ownItems ?? []).length !== distinctItemIds.size) {
    throw new Error('One of those items is no longer in your inventory');
  }

  const { data: bundle, error: bundleErr } = await supabase
    .from('pos_bundles')
    .upsert(
      {
        organization_id: org.id,
        item_name: input.item_name,
        match_key: matchKey,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,match_key' },
    )
    .select('id')
    .single();

  if (bundleErr || !bundle) {
    throw new Error(`Could not save that deal: ${bundleErr?.message ?? 'unknown error'}`);
  }

  // admin-scope-ok: `bundle` was upserted with organization_id = org.id above,
  // so this id is always in-org. pos_bundle_components inherits tenancy through
  // its bundle and has no organization_id column of its own.
  const { error: clearErr } = await supabase
    .from('pos_bundle_components')
    .delete()
    .eq('bundle_id', bundle.id);
  if (clearErr) throw new Error(`Could not update that recipe: ${clearErr.message}`);

  // admin-scope-ok: as above — bundle.id is this org's, and every
  // inventory_item_id was verified in-org by the ownItems check.
  const { error: insertErr } = await supabase.from('pos_bundle_components').insert(
    [...merged.values()].map((m) => ({
      bundle_id: bundle.id,
      inventory_item_id: m.itemId,
      quantity: m.quantity,
      unit: m.unit,
    })),
  );
  if (insertErr) throw new Error(`Could not save those components: ${insertErr.message}`);

  // (1) Exclusion and bundle are mutually exclusive — see the doc comment.
  const { data: removedExclusions } = await supabase
    .from('pos_excluded_items')
    .delete()
    .eq('organization_id', org.id)
    .eq('match_key', matchKey)
    .select('id');

  // (2) Retire the phantom item the deal created before it had a recipe.
  let deactivated = 0;
  const { data: existing } = await supabase
    .from('inventory_items')
    .select('id, name')
    .eq('organization_id', org.id)
    .eq('is_active', true);

  const phantomIds = (existing ?? [])
    .filter((i) => posItemMatchKey(i.name) === matchKey)
    .map((i) => i.id);

  if (phantomIds.length) {
    const { error } = await supabase
      .from('inventory_items')
      .update({ is_active: false })
      .in('id', phantomIds)
      .eq('organization_id', org.id);
    if (!error) deactivated = phantomIds.length;
  }

  revalidatePath('/app/settings');
  revalidatePath('/app/inventory');

  return {
    id: bundle.id,
    unexcluded: (removedExclusions ?? []).length > 0,
    deactivated,
  };
}

export async function deleteBundle(id: string): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('pos_bundles')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id);

  if (error) throw new Error(`Could not delete that deal: ${error.message}`);

  // Stock already deducted through this recipe is deliberately left alone.
  // Those movements happened; reversing them because the recipe was deleted
  // would silently rewrite a bar's history. From the next sync the deal syncs
  // as an ordinary item again unless it is also excluded.
  revalidatePath('/app/settings');
}
