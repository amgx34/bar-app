'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { demoRequestSchema } from '@/lib/schemas/demo';

export async function submitDemoRequest(raw: unknown): Promise<void> {
  const input = demoRequestSchema.parse(raw);
  const admin = createAdminClient();

  const { error } = await admin.from('demo_requests').insert({
    name:           input.name,
    business_name:  input.business_name,
    email:          input.email,
    phone:          input.phone  || null,
    num_locations:  input.num_locations,
    inquiry_type:   input.inquiry_type,
    message:        input.message      || null,
    preferred_date: input.preferred_date || null,
    status:         'new',
  });

  if (error) throw new Error('Failed to save your request. Please try again.');

  // ── Notification email (placeholder — wire up Resend / Gmail here) ────────
  // await sendEmail(
  //   process.env.ADMIN_NOTIFY_EMAIL ?? '',
  //   `New ${input.inquiry_type} request from ${input.name} — ${input.business_name}`,
  //   `<p>Name: ${input.name}</p><p>Email: ${input.email}</p><p>Phone: ${input.phone}</p>
  //    <p>Business: ${input.business_name} (${input.num_locations} location(s))</p>
  //    <p>Type: ${input.inquiry_type}</p>
  //    <p>Preferred date: ${input.preferred_date}</p>
  //    <p>Message: ${input.message}</p>`
  // );
}
