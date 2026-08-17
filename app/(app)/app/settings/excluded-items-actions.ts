'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';
import { canEditInventory } from '@/lib/permissions';
import { posItemMatchKey } from '@/lib/pos/excluded-items';

export type ExcludedItem = {
  id: string;
  item_name: string;
  reason: string | null;
  created_at: string;
};

const excludeSchema = z.object({
  item_name: z.string().trim().min(1, 'Enter the item name as the POS reports it').max(200),
  reason: z.string().trim().max(200).optional(),
  /** Also deactivate the matching inventory item, if one was already synced. */
  deactivateExisting: z.boolean().default(true),
});

export async function listExcludedItems(): Promise<ExcludedItem[]> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('pos_excluded_items')
    .select('id, item_name, reason, created_at')
    .eq('organization_id', org.id)
    .order('item_name');

  return (data ?? []) as ExcludedItem[];
}

/**
 * Excludes an item from POS sync.
 *
 * Deals ring up like products, so by the time an operator notices one it has
 * usually already been synced into inventory. Excluding it therefore also
 * deactivates the existing row by default — otherwise the phantom item stays
 * in stock lists forever and only *future* syncs are clean.
 *
 * Deactivate rather than delete: usage logs and sales history reference these
 * rows, and the codebase never hard-deletes inventory for that reason.
 */
export async function excludeItem(raw: unknown): Promise<{ deactivated: number }> {
  const { org, role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const input = excludeSchema.parse(raw);
  const supabase = createAdminClient();
  const matchKey = posItemMatchKey(input.item_name);

  const { error } = await supabase.from('pos_excluded_items').upsert(
    {
      organization_id: org.id,
      item_name: input.item_name.trim(),
      match_key: matchKey,
      reason: input.reason || null,
    },
    { onConflict: 'organization_id,match_key' },
  );

  if (error) throw new Error(`Could not exclude that item: ${error.message}`);

  let deactivated = 0;
  if (input.deactivateExisting) {
    // Matched in JS on the same normalised key the ingest filter uses, rather
    // than with a SQL ilike — so "2-For-1  Well" and "2-for-1 well" resolve
    // identically in both places.
    const { data: items } = await supabase
      .from('inventory_items')
      .select('id, name')
      .eq('organization_id', org.id)
      .eq('is_active', true);

    const ids = (items ?? [])
      .filter((i) => posItemMatchKey(i.name) === matchKey)
      .map((i) => i.id);

    if (ids.length) {
      const { error: deactivateErr } = await supabase
        .from('inventory_items')
        .update({ is_active: false })
        .in('id', ids)
        .eq('organization_id', org.id);

      if (!deactivateErr) deactivated = ids.length;
    }
  }

  revalidatePath('/app/settings');
  revalidatePath('/app/inventory');
  return { deactivated };
}

export async function removeExclusion(id: string): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('pos_excluded_items')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id);

  if (error) throw new Error(`Could not remove that exclusion: ${error.message}`);

  // The item is not reactivated automatically: it will reappear on the next POS
  // sync if it still sells, and silently un-deactivating stock the operator
  // retired for other reasons would be worse than making them undo it.
  revalidatePath('/app/settings');
}

/**
 * Inventory items that look like deals rather than stock, offered as
 * one-click exclusions.
 *
 * Heuristic and deliberately conservative — it only suggests, never acts.
 * A false positive here would retire a real product.
 */
export async function suggestDealItems(): Promise<string[]> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const [{ data: items }, { data: excluded }] = await Promise.all([
    supabase
      .from('inventory_items')
      .select('name')
      .eq('organization_id', org.id)
      .eq('is_active', true),
    supabase
      .from('pos_excluded_items')
      .select('match_key')
      .eq('organization_id', org.id),
  ]);

  const already = new Set((excluded ?? []).map((e) => e.match_key));

  // Wording bars actually use on combo buttons.
  const DEAL_HINTS = [
    /\bbucket\b/i,
    /\b\d+\s*(for|4)\s*\d+\b/i,      // 2 for 1, 3 for 2
    /\bcombo\b/i,
    /\bdeal\b/i,
    /\bspecial\b/i,
    /\bhappy\s*hour\b/i,
    /\bpitcher\b/i,
    /\bround\b/i,
    /\bpackage\b/i,
    /\bhalf\s*price\b/i,
  ];

  return (items ?? [])
    .map((i) => i.name)
    .filter((name) => !already.has(posItemMatchKey(name)))
    .filter((name) => DEAL_HINTS.some((re) => re.test(name)))
    .sort();
}
