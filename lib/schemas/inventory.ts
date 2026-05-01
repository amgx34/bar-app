import { z } from 'zod';

export const inventoryItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category_id: z.string().uuid().nullable().optional(),
  sku: z.string().max(64).optional().or(z.literal('')),
  unit: z.string().min(1).max(32),
  par_level: z.number().nonnegative().nullable().optional(),
  cost_price: z.number().nonnegative().nullable().optional(),
  sale_price: z.number().nonnegative().nullable().optional(),
  current_stock: z.number().nonnegative(),
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