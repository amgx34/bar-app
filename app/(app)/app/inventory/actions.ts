'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
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

// =====================================================
// Create item
// =====================================================
export async function createItem(raw: unknown) {
  const { org, role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const input = inventoryItemSchema.parse(raw);
  const supabase = await createClient();

  const { error } = await supabase.from('inventory_items').insert({
    organization_id: org.id,
    name: input.name,
    category_id: input.category_id || null,
    sku: input.sku || null,
    unit: input.unit,
    par_level: input.par_level ?? null,
    cost_price: input.cost_price ?? null,
    sale_price: input.sale_price ?? null,
    current_stock: input.current_stock ?? 0,
  });

  if (error) throw error;
  revalidatePath('/app/inventory');
}

// =====================================================
// Update item
// =====================================================
export async function updateItem(itemId: string, raw: unknown) {
  const { role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const input = inventoryItemSchema.parse(raw);
  const supabase = await createClient();

  // Note: no .eq('organization_id', ...) — RLS handles it.
  // Even if itemId belonged to another org, the update would affect 0 rows.
  const { error } = await supabase
    .from('inventory_items')
    .update({
      name: input.name,
      category_id: input.category_id || null,
      sku: input.sku || null,
      unit: input.unit,
      par_level: input.par_level ?? null,
      cost_price: input.cost_price ?? null,
      sale_price: input.sale_price ?? null,
      // Deliberately NOT updating current_stock here — use adjustStock for that.
    })
    .eq('id', itemId);

  if (error) throw error;
  revalidatePath('/app/inventory');
}

// =====================================================
// Soft-delete (mark inactive). Never hard-delete — sales reference these.
// =====================================================
export async function deactivateItem(itemId: string) {
  const { role } = await getCurrentOrg();
  if (!canDeleteInventory(role)) throw new Error('Not authorized');

  const supabase = await createClient();
  const { error } = await supabase
    .from('inventory_items')
    .update({ is_active: false })
    .eq('id', itemId);

  if (error) throw error;
  revalidatePath('/app/inventory');
}

export async function reactivateItem(itemId: string) {
  const { role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const supabase = await createClient();
  const { error } = await supabase
    .from('inventory_items')
    .update({ is_active: true })
    .eq('id', itemId);

  if (error) throw error;
  revalidatePath('/app/inventory');
}

// =====================================================
// Adjust stock. Writes both the new current_stock on the item
// AND a usage_logs row for audit trail.
// =====================================================
export async function adjustStock(raw: unknown) {
  const { org, role } = await getCurrentOrg();
  if (!canAdjustStock(role)) throw new Error('Not authorized');

  const input = stockAdjustmentSchema.parse(raw);
  const supabase = await createClient();

  // Fetch current stock so we can compute the new value.
  const { data: item, error: fetchErr } = await supabase
    .from('inventory_items')
    .select('id, current_stock')
    .eq('id', input.item_id)
    .single();

  if (fetchErr) throw fetchErr;
  if (!item) throw new Error('Item not found');

  const currentStock = Number(item.current_stock);
  const newStock =
    input.mode === 'set' ? input.quantity : currentStock + input.quantity;

  if (newStock < 0) throw new Error('Stock cannot go negative');

  // Compute the delta written to usage_logs (for audit)
  const delta = newStock - currentStock;

  // 1. Update item stock
  const { error: updErr } = await supabase
    .from('inventory_items')
    .update({ current_stock: newStock })
    .eq('id', input.item_id);
  if (updErr) throw updErr;

  // 2. Log the adjustment. Reasons that reduce stock are stored as positive
  //    quantities in usage_logs (the sign convention is: usage_logs.quantity
  //    is always positive; the reason tells you what happened).
  //    Deliveries and recounts can result in positive deltas (stock went up) —
  //    we log them too, with the sign of the delta.
  const { error: logErr } = await supabase.from('usage_logs').insert({
    organization_id: org.id,
    item_id: input.item_id,
    quantity: Math.abs(delta),
    reason: input.reason,
    note: input.note || (input.mode === 'set'
      ? `Count set to ${newStock}`
      : `Delta ${delta >= 0 ? '+' : ''}${delta}`),
  });
  if (logErr) throw logErr;

  revalidatePath('/app/inventory');
}

// =====================================================
// Categories
// =====================================================
export async function createCategory(raw: unknown) {
  const { org, role } = await getCurrentOrg();
  if (!canManageCategories(role)) throw new Error('Not authorized');

  const input = categorySchema.parse(raw);
  const supabase = await createClient();

  const { error } = await supabase.from('inventory_categories').insert({
    organization_id: org.id,
    name: input.name,
  });

  if (error) throw error;
  revalidatePath('/app/inventory');
}

export async function deleteCategory(categoryId: string) {
  const { role } = await getCurrentOrg();
  if (!canManageCategories(role)) throw new Error('Not authorized');

  const supabase = await createClient();
  const { error } = await supabase
    .from('inventory_categories')
    .delete()
    .eq('id', categoryId);

  if (error) throw error;
  revalidatePath('/app/inventory');
}

