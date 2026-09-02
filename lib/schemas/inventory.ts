import { z } from 'zod';

export const inventoryItemSchema = z.object({
  name:           z.string().min(1, 'Name is required').max(200),
  category_id:    z.string().uuid().nullable().optional(),
  rep_id:         z.string().uuid().nullable().optional(),
  sku:            z.string().max(64).optional().or(z.literal('')),
  unit:           z.string().min(1).max(32),
  par_level:      z.number().nonnegative().nullable().optional(),
  cost_price:     z.number().nonnegative().nullable().optional(),
  sale_price:     z.number().nonnegative().nullable().optional(),
  current_stock:  z.number().nonnegative(),
  // Liquor / bottle tracking
  bottle_size_ml: z.number().int().positive().nullable().optional(),
  pour_size_oz:   z.number().positive().nullable().optional(),
  /**
   * Singles in one purchase pack. Entry-time only — see the column comment
   * in 20260901000003. Minimum 2, because a pack of one is not a pack.
   */
  units_per_pack: z.number().int().min(2).nullable().optional(),
});
export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;

export const stockAdjustmentSchema = z.object({
  item_id: z.string().uuid(),
  mode: z.enum(['set', 'delta']),    // set = exact count; delta = add/remove
  quantity: z.number(),
  reason: z.enum(['recount', 'delivery', 'spillage', 'comp', 'staff_drink', 'other']),
  note: z.string().max(500).optional().or(z.literal('')),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export const categorySchema = z.object({
  name: z.string().min(1).max(60),
});
export type CategoryInput = z.infer<typeof categorySchema>;