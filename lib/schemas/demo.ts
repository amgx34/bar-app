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

  /**
   * First-touch campaign parameters, from lib/utm.ts.
   *
   * Every field is optional and bounded, and the whole object is optional: it
   * comes from the browser, so it is untrusted input that must never be able to
   * fail a legitimate submission or carry an unbounded payload into the
   * database and the notification email.
   */
  attribution: z
    .object({
      utm_source:   z.string().max(200).optional(),
      utm_medium:   z.string().max(200).optional(),
      utm_campaign: z.string().max(200).optional(),
      utm_term:     z.string().max(200).optional(),
      utm_content:  z.string().max(200).optional(),
      gclid:        z.string().max(200).optional(),
      fbclid:       z.string().max(200).optional(),
      landing_page: z.string().max(200).optional(),
      referrer:     z.string().max(200).optional(),
    })
    // Unknown keys dropped rather than rejected: an ad platform adding a
    // parameter must not start failing the contact form.
    .strip()
    .optional(),
});

export type DemoRequestInput = z.infer<typeof demoRequestSchema>;
