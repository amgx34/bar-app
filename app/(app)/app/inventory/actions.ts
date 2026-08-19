'use server';

import { z } from 'zod';
import { assertParsableTextUpload } from '@/lib/uploads';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';
import {
  canEditInventory,
  canDeleteInventory,
  canAdjustStock,
  canManageCategories,
} from '@/lib/permissions';
import {
  inventoryItemSchema,
  stockAdjustmentSchema,
  categorySchema,
} from '@/lib/schemas/inventory';
import { parseInventoryWithAI } from '@/lib/ai-parsers/parse-inventory-with-ai';

// ── Import types ──────────────────────────────────────────────────────────────

export type ReviewItem = {
  tempId: string;
  name: string;
  quantity: number;
  unit: string;
  cost_price: number | null;
  category: string | null;
  sku: string | null;
  existingId: string | null;
  existingName: string | null;
  existingStock: number | null;
};

export type CommitItem = {
  name: string;
  quantity: number;
  unit: string;
  cost_price: number | null;
  category: string | null;
  sku: string | null;
  existingId: string | null;
};

export type ImportResult = {
  created: number;
  updated: number;
  errors: string[];
};

// =====================================================
// Create item
// =====================================================
export async function createItem(raw: unknown) {
  const { org, role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const input = inventoryItemSchema.parse(raw);
  const supabase = createAdminClient();

  const { error } = await supabase.from('inventory_items').insert({
    organization_id: org.id,
    name:           input.name,
    category_id:    input.category_id  || null,
    rep_id:         input.rep_id       || null,
    sku:            input.sku          || null,
    unit:           input.unit,
    par_level:      input.par_level    ?? null,
    cost_price:     input.cost_price   ?? null,
    sale_price:     input.sale_price   ?? null,
    current_stock:  input.current_stock ?? 0,
    bottle_size_ml: input.bottle_size_ml ?? null,
    pour_size_oz:   input.pour_size_oz   ?? null,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/app/inventory');
}

// =====================================================
// Update item
// =====================================================
export async function updateItem(itemId: string, raw: unknown) {
  const { org, role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const input = inventoryItemSchema.parse(raw);
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('inventory_items')
    .update({
      name:           input.name,
      category_id:    input.category_id  || null,
      rep_id:         input.rep_id       || null,
      sku:            input.sku          || null,
      unit:           input.unit,
      par_level:      input.par_level    ?? null,
      cost_price:     input.cost_price   ?? null,
      sale_price:     input.sale_price   ?? null,
      bottle_size_ml: input.bottle_size_ml ?? null,
      pour_size_oz:   input.pour_size_oz   ?? null,
    })
    .eq('id', itemId)
    .eq('organization_id', org.id);

  if (error) throw new Error(error.message);
  revalidatePath('/app/inventory');
}

// =====================================================
// Soft-delete (mark inactive). Never hard-delete — sales reference these.
// =====================================================
export async function deactivateItem(itemId: string) {
  const { org, role } = await getCurrentOrg();
  if (!canDeleteInventory(role)) throw new Error('Not authorized');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('inventory_items')
    .update({ is_active: false })
    .eq('id', itemId)
    .eq('organization_id', org.id);

  if (error) throw new Error(error.message);
  revalidatePath('/app/inventory');
}

export async function reactivateItem(itemId: string) {
  const { org, role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('inventory_items')
    .update({ is_active: true })
    .eq('id', itemId)
    .eq('organization_id', org.id);

  if (error) throw new Error(error.message);
  revalidatePath('/app/inventory');
}

// =====================================================
// Adjust stock
// =====================================================
export async function adjustStock(raw: unknown) {
  const { org, role } = await getCurrentOrg();
  if (!canAdjustStock(role)) throw new Error('Not authorized');

  const input = stockAdjustmentSchema.parse(raw);
  const supabase = createAdminClient();

  const { data: item, error: fetchErr } = await supabase
    .from('inventory_items')
    .select('id, current_stock')
    .eq('id', input.item_id)
    .eq('organization_id', org.id)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!item) throw new Error('Item not found');

  const currentStock = Number(item.current_stock);
  const newStock =
    input.mode === 'set' ? input.quantity : currentStock + input.quantity;

  if (newStock < 0) throw new Error('Stock cannot go negative');

  const delta = newStock - currentStock;

  // admin-scope-ok: `item` was fetched above with .eq('organization_id', org.id)
  // and the function throws when it is missing, so this id is always in-org.
  const { error: updErr } = await supabase
    .from('inventory_items')
    .update({ current_stock: newStock })
    .eq('id', input.item_id);
  if (updErr) throw new Error(updErr.message);

  const { error: logErr } = await supabase.from('usage_logs').insert({
    organization_id: org.id,
    item_id: input.item_id,
    quantity: Math.abs(delta),
    reason: input.reason,
    note: input.note || (input.mode === 'set'
      ? `Count set to ${newStock}`
      : `Delta ${delta >= 0 ? '+' : ''}${delta}`),
  });
  if (logErr) throw new Error(logErr.message);

  revalidatePath('/app/inventory');
}

// =====================================================
// Categories
// =====================================================
export async function createCategory(raw: unknown) {
  const { org, role } = await getCurrentOrg();
  if (!canManageCategories(role)) throw new Error('Not authorized');

  const input = categorySchema.parse(raw);
  const supabase = createAdminClient();

  const { error } = await supabase.from('inventory_categories').insert({
    organization_id: org.id,
    name: input.name,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/app/inventory');
}

/**
 * Sets how a category's purchases are treated in the P&L.
 *
 * Category-level rather than per item: a bar has a handful of categories and
 * hundreds of items, and the classification is a property of the KIND of thing,
 * not of each bottle. See lib/books/cost-structure.ts for what each type does.
 */
export async function updateCategoryCostType(categoryId: string, costType: string) {
  const { org, role } = await getCurrentOrg();
  if (!canManageCategories(role)) throw new Error('Not authorized');

  const parsed = z
    .enum(['beverage_cogs', 'food_cogs', 'supplies', 'excluded'])
    .parse(costType);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('inventory_categories')
    .update({ cost_type: parsed })
    .eq('id', categoryId)
    .eq('organization_id', org.id);

  if (error) throw new Error(error.message);

  // The books read this on every load, so both surfaces need refreshing.
  revalidatePath('/app/inventory');
  revalidatePath('/app/books');
}

/**
 * Sets the default pour for a category.
 *
 * Category-level so "spirits pour 1.5oz" is stated once rather than on each of
 * several hundred synced items. Items override it individually; see
 * lib/pos/pour.ts for the item -> category -> organisation chain.
 *
 * Null clears it, which is not the same as zero — zero would be a pour of
 * nothing, and the resolver treats it as unset anyway.
 */
export async function updateCategoryPour(categoryId: string, pourOz: number | null) {
  const { org, role } = await getCurrentOrg();
  if (!canManageCategories(role)) throw new Error('Not authorized');

  // A gallon is 128oz. Anything beyond that is a typo, and a typo here changes
  // every deduction in the category at once.
  const parsed = z.number().positive().max(128).nullable().parse(pourOz);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('inventory_categories')
    .update({ default_pour_oz: parsed })
    .eq('id', categoryId)
    .eq('organization_id', org.id);

  if (error) throw new Error(error.message);

  revalidatePath('/app/inventory');
}

export async function deleteCategory(categoryId: string) {
  const { org, role } = await getCurrentOrg();
  if (!canManageCategories(role)) throw new Error('Not authorized');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('inventory_categories')
    .delete()
    .eq('id', categoryId)
    .eq('organization_id', org.id);

  if (error) throw new Error(error.message);
  revalidatePath('/app/inventory');
}

// =====================================================
// AI Import — parse
// =====================================================
export async function parseInventoryForImport(text: string): Promise<ReviewItem[]> {
  const { org, role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  // The picker's `accept` attribute is a client-side hint; this is the gate.
  assertParsableTextUpload(text);

  const supabase = createAdminClient();

  // Run AI parse and existing-item fetch in parallel
  const [aiItems, { data: existingItems }] = await Promise.all([
    parseInventoryWithAI(text),
    supabase
      .from('inventory_items')
      .select('id, name, current_stock')
      .eq('organization_id', org.id)
      .eq('is_active', true),
  ]);

  // Build lookup map: lowercased name → existing item
  const existingMap = new Map<string, { id: string; name: string; current_stock: number }>();
  for (const item of existingItems ?? []) {
    existingMap.set(item.name.toLowerCase(), {
      id: item.id,
      name: item.name,
      current_stock: Number(item.current_stock),
    });
  }

  return aiItems.map((item, i) => {
    const match = existingMap.get(item.name.toLowerCase());
    return {
      tempId: `import-${i}`,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      cost_price: item.cost_price,
      category: item.category,
      sku: item.sku,
      existingId: match?.id ?? null,
      existingName: match?.name ?? null,
      existingStock: match?.current_stock ?? null,
    };
  });
}

// =====================================================
// AI Import — commit
// =====================================================
export async function importInventoryItems(
  items: CommitItem[],
  stockMode: 'set' | 'add',
): Promise<ImportResult> {
  const { org, role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const supabase = createAdminClient();
  const result: ImportResult = { created: 0, updated: 0, errors: [] };

  // Build category name → id map (case-insensitive, creates missing ones)
  const { data: existingCats } = await supabase
    .from('inventory_categories')
    .select('id, name')
    .eq('organization_id', org.id);

  const catMap = new Map<string, string>();
  for (const c of existingCats ?? []) catMap.set(c.name.toLowerCase(), c.id);

  async function resolveCategoryId(name: string | null): Promise<string | null> {
    if (!name) return null;
    const key = name.toLowerCase();
    if (catMap.has(key)) return catMap.get(key)!;
    const { data, error } = await supabase
      .from('inventory_categories')
      .insert({ organization_id: org.id, name })
      .select('id')
      .single();
    if (error || !data) return null;
    catMap.set(key, data.id);
    return data.id;
  }

  for (const item of items) {
    try {
      if (item.existingId) {
        // Update existing item
        const { data: current } = await supabase
          .from('inventory_items')
          .select('current_stock')
          .eq('id', item.existingId)
          .eq('organization_id', org.id)
          .single();

        const currentStock = Number(current?.current_stock ?? 0);
        const newStock = stockMode === 'set' ? item.quantity : currentStock + item.quantity;

        const update: Record<string, unknown> = { current_stock: newStock };
        if (item.cost_price !== null) update.cost_price = item.cost_price;

        const { error } = await supabase
          .from('inventory_items')
          .update(update)
          .eq('id', item.existingId)
          .eq('organization_id', org.id);

        if (error) throw new Error(error.message);

        // Log the stock change
        const delta = newStock - currentStock;
        if (delta !== 0) {
          await supabase.from('usage_logs').insert({
            organization_id: org.id,
            item_id: item.existingId,
            quantity: Math.abs(delta),
            reason: 'delivery',
            note: `Imported — ${stockMode === 'set' ? `count set to ${newStock}` : `+${delta}`}`,
          });
        }

        result.updated++;
      } else {
        // Create new item
        const categoryId = await resolveCategoryId(item.category);

        const { error } = await supabase.from('inventory_items').insert({
          organization_id: org.id,
          name: item.name,
          unit: item.unit || 'each',
          category_id: categoryId,
          sku: item.sku || null,
          cost_price: item.cost_price ?? null,
          current_stock: item.quantity,
          par_level: null,
          sale_price: null,
        });

        if (error) throw new Error(error.message);
        result.created++;
      }
    } catch (err) {
      result.errors.push(`${item.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  revalidatePath('/app/inventory');
  return result;
}
