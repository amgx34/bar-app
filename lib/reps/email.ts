/**
 * Email via Gmail SMTP (nodemailer).
 *
 * Required env vars:
 *   GMAIL_USER          — your full Gmail address, e.g. orders@yourbusiness.com
 *   GMAIL_APP_PASSWORD  — 16-char app password from Google Account → Security → App passwords
 *
 * Setup (one-time):
 *   1. Make sure 2-Step Verification is ON for the Gmail account.
 *   2. Go to https://myaccount.google.com/apppasswords
 *   3. Create a new app password → name it "Rail Orders"
 *   4. Copy the 16-character password (spaces don't matter) into GMAIL_APP_PASSWORD
 */
import nodemailer from 'nodemailer';
import type { OrderItemInput } from '@/lib/schemas/reps';

// ── Transporter (reused across requests) ─────────────────────────────────────

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;

  const user = process.env.GMAIL_USER;
  // Strip spaces — Google displays app passwords as "abcd efgh ijkl mnop"
  const pass = (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, '');

  if (!user || !pass) {
    throw new Error(
      'Email not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.local.\n' +
      'Generate a 16-char app password at https://myaccount.google.com/apppasswords',
    );
  }

  _transporter = nodemailer.createTransport({
    host:   'smtp.gmail.com',
    port:   587,
    secure: false,
    auth:   { user, pass },
    tls:    { rejectUnauthorized: false },
  });

  return _transporter;
}

// ── Public send function ──────────────────────────────────────────────────────

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
): Promise<void> {
  const from = `"Rail Orders" <${process.env.GMAIL_USER}>`;
  await getTransporter().sendMail({
    from,
    to,
    subject,
    html,
    replyTo: replyTo ?? from,
  });
}

// ── HTML templates ────────────────────────────────────────────────────────────

export function buildOrderEmail(data: {
  orgName:      string;
  repName:      string;
  repEmail:     string;
  poNumber:     string;
  deliveryDate: string;
  notes:        string;
  items:        OrderItemInput[];
}): string {
  const rows = data.items.map((item) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb">${esc(item.name)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums">${item.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb">${esc(item.unit)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280">${esc(item.note ?? '')}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Order from ${esc(data.orgName)}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;color:#111827">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden">
    <div style="background:#111827;padding:24px 32px">
      <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:0.15em">RAIL</p>
      <p style="margin:4px 0 0;font-size:13px;color:#9ca3af">Purchase Order</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 4px;font-size:16px">Hi <strong>${esc(data.repName)}</strong>,</p>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px">
        <strong>${esc(data.orgName)}</strong> has placed the following order.
        Please confirm receipt by replying to this email.
      </p>
      ${data.poNumber     ? `<p style="margin:0 0 8px;font-size:14px"><strong>PO Number:</strong> ${esc(data.poNumber)}</p>`       : ''}
      ${data.deliveryDate ? `<p style="margin:0 0 8px;font-size:14px"><strong>Requested Delivery:</strong> ${esc(data.deliveryDate)}</p>` : ''}
      ${data.notes        ? `<p style="margin:0 0 24px;font-size:14px"><strong>Notes:</strong> ${esc(data.notes)}</p>`              : '<div style="margin-bottom:24px"></div>'}
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:10px 12px;text-align:left;font-weight:600">Item</th>
            <th style="padding:10px 12px;text-align:right;font-weight:600">Qty</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600">Unit</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600">Note</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:32px 0 0;font-size:13px;color:#9ca3af">
        This order was sent automatically by Rail bar management software.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function buildConfirmationEmail(data: {
  orgName:    string;
  repName:    string;
  repCompany: string;
  poNumber:   string;
  itemCount:  number;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<body style="font-family:Arial,sans-serif;color:#111827;padding:32px;max-width:500px">
  <h2 style="margin:0 0 16px">Order sent ✓</h2>
  <p>Your order to <strong>${esc(data.repName)}${data.repCompany ? ` (${esc(data.repCompany)})` : ''}</strong> was sent successfully.</p>
  ${data.poNumber ? `<p><strong>PO Number:</strong> ${esc(data.poNumber)}</p>` : ''}
  <p><strong>Items:</strong> ${data.itemCount}</p>
  <p style="color:#6b7280;font-size:13px;margin-top:32px">Sent from Rail bar management.</p>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
