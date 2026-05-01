'use server';

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
    name: input.name,
    category_id: input.category_id || null,
    sku: input.sku || null,
    unit: input.unit,
    par_level: input.par_level ?? null,
    cost_price: input.cost_price ?? null,
    sale_price: input.sale_price ?? null,
    current_stock: input.current_stock ?? 0,
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
      name: input.name,
      category_id: input.category_id || null,
      sku: input.sku || null,
      unit: input.unit,
      par_level: input.par_level ?? null,
      cost_price: input.cost_price ?? null,
      sale_price: input.sale_price ?? null,
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
