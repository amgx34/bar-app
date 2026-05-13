import { z } from 'zod';

export const demoRequestSchema = z.object({
  name:           z.string().min(2, 'Name is required').max(120),
  business_name:  z.string().min(2, 'Business name is required').max(120),
  email:          z.string().email('Valid email required'),
  phone:          z.string().max(30).optional().or(z.literal('')),
  num_locations:  z.number().min(1).max(500),
  inquiry_type:   z.enum(['general', 'demo', 'pricing', 'other']),
  message:        z.string().max(2000).optional().or(z.literal('')),
  preferred_date: z.string().optional().or(z.literal('')),
});

export type DemoRequestInput = z.infer<typeof demoRequestSchema>;
