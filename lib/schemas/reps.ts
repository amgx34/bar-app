import { z } from 'zod';

export const repSchema = z.object({
  name:    z.string().min(1, 'Name is required').max(120),
  company: z.string().max(120).optional().or(z.literal('')),
  phone:   z.string().max(30).optional().or(z.literal('')),
  email:   z.union([z.string().email('Invalid email'), z.literal('')]).optional(),
  notes:   z.string().max(2000).optional().or(z.literal('')),
});
export type RepInput = z.infer<typeof repSchema>;

export const orderItemSchema = z.object({
  inventory_item_id: z.string().uuid().nullable().optional(),
  name:              z.string().min(1, 'Item name required'),
  quantity:          z.number().min(0.001, 'Quantity must be > 0'),
  unit:              z.string().min(1),
  note:              z.string().max(200).optional().or(z.literal('')),
});
export type OrderItemInput = z.infer<typeof orderItemSchema>;

export const orderSchema = z.object({
  po_number:     z.string().max(64).optional().or(z.literal('')),
  delivery_date: z.string().optional(),
  notes:         z.string().max(2000).optional().or(z.literal('')),
  send_email:    z.boolean(),
  send_sms:      z.boolean(),
  items:         z.array(orderItemSchema).min(1, 'Add at least one item'),
}).refine((d) => d.send_email || d.send_sms, {
  message: 'Choose at least one send method',
  path: ['send_email'],
});
export type OrderInput = z.infer<typeof orderSchema>;
