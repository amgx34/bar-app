'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/reps/email';
import { demoRequestSchema } from '@/lib/schemas/demo';

const NOTIFY_TO = 'railsystemspos@gmail.com';

const INQUIRY_LABELS: Record<string, string> = {
  demo:    'Schedule a Demo',
  pricing: 'Pricing Information',
  general: 'General Inquiry',
  other:   'Other',
};

function esc(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildNotificationEmail(input: {
  name: string;
  business_name: string;
  email: string;
  phone?: string;
  num_locations: number;
  inquiry_type: string;
  message?: string;
  preferred_date?: string;
}): string {
  const typeLabel = INQUIRY_LABELS[input.inquiry_type] ?? input.inquiry_type;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>New Contact: ${esc(input.business_name)}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">

    <div style="background:#0f766e;padding:20px 28px">
      <p style="margin:0;font-size:20px;font-weight:700;color:#fff;letter-spacing:0.15em">RAIL</p>
      <p style="margin:4px 0 0;font-size:12px;color:#99f6e4">New contact form submission</p>
    </div>

    <div style="padding:28px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr>
          <td style="padding:8px 0;color:#6b7280;width:140px">Type</td>
          <td style="padding:8px 0;font-weight:600;color:#0f766e">${esc(typeLabel)}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:8px 0;color:#6b7280">Name</td>
          <td style="padding:8px 0;font-weight:600">${esc(input.name)}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:8px 0;color:#6b7280">Business</td>
          <td style="padding:8px 0;font-weight:600">${esc(input.business_name)}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:8px 0;color:#6b7280">Locations</td>
          <td style="padding:8px 0">${input.num_locations}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:8px 0;color:#6b7280">Email</td>
          <td style="padding:8px 0"><a href="mailto:${esc(input.email)}" style="color:#0f766e">${esc(input.email)}</a></td>
        </tr>
        ${input.phone ? `<tr style="border-top:1px solid #f3f4f6">
          <td style="padding:8px 0;color:#6b7280">Phone</td>
          <td style="padding:8px 0">${esc(input.phone)}</td>
        </tr>` : ''}
        ${input.preferred_date ? `<tr style="border-top:1px solid #f3f4f6">
          <td style="padding:8px 0;color:#6b7280">Preferred Date</td>
          <td style="padding:8px 0">${esc(input.preferred_date)}</td>
        </tr>` : ''}
        ${input.message ? `<tr style="border-top:1px solid #f3f4f6">
          <td style="padding:8px 0;color:#6b7280;vertical-align:top">Message</td>
          <td style="padding:8px 0;white-space:pre-wrap">${esc(input.message)}</td>
        </tr>` : ''}
      </table>

      <div style="margin-top:20px;padding:12px 16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
        <a href="mailto:${esc(input.email)}?subject=Re: Your Rail Demo Request" style="color:#0f766e;font-size:13px;font-weight:600;text-decoration:none">
          ↩ Reply to ${esc(input.name)}
        </a>
      </div>
    </div>

    <div style="padding:12px 28px;background:#f9fafb;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:11px;color:#9ca3af">
        Sent automatically by Rail · contact form submission
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function submitDemoRequest(raw: unknown): Promise<void> {
  const input = demoRequestSchema.parse(raw);
  const admin = createAdminClient();

  // Save to DB
  const { error } = await admin.from('demo_requests').insert({
    name:           input.name,
    business_name:  input.business_name,
    email:          input.email,
    phone:          input.phone         || null,
    num_locations:  input.num_locations,
    inquiry_type:   input.inquiry_type,
    message:        input.message       || null,
    preferred_date: input.preferred_date || null,
    status:         'new',
  });

  if (error) throw new Error('Failed to save your request. Please try again.');

  // Send notification email (best-effort — never fail the form submission if email errors)
  const typeLabel = INQUIRY_LABELS[input.inquiry_type] ?? input.inquiry_type;
  const subject   = `[Rail] ${typeLabel} — ${input.business_name} (${input.num_locations} loc)`;

  await sendEmail(NOTIFY_TO, subject, buildNotificationEmail(input)).catch((err) => {
    console.error('[contact] notification email failed:', err?.message ?? err);
  });
}
