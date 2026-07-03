/**
 * Direct deposit 2FA delivery — SMS (Twilio) or email (Gmail) fallback.
 * Never log the OTP code itself.
 */

import nodemailer from 'nodemailer';

// ── Email OTP (fallback when no phone is configured) ──────────────────────────

function getMailTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, '');
  if (!user || !pass) throw new Error('Gmail is not configured — set GMAIL_USER and GMAIL_APP_PASSWORD');
  return nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user, pass } });
}

export async function sendOTPEmail(toEmail: string, code: string): Promise<void> {
  const transporter = getMailTransporter();
  const from = `"Rail Payroll Security" <${process.env.GMAIL_USER}>`;

  await transporter.sendMail({
    from,
    to:      toEmail,
    subject: `Rail Payroll: Your verification code is ${code}`,
    html: `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
  <div style="background:#0f766e;padding:20px 28px">
    <p style="margin:0;font-size:18px;font-weight:700;color:#fff;letter-spacing:0.2em">RAIL</p>
    <p style="margin:4px 0 0;font-size:12px;color:#99f6e4">Payroll Security Verification</p>
  </div>
  <div style="padding:28px">
    <p style="margin:0 0 16px;font-size:15px;color:#111827">
      A direct deposit change was requested. Enter this code to confirm:
    </p>
    <div style="text-align:center;margin:24px 0">
      <span style="font-size:36px;font-weight:800;letter-spacing:0.3em;color:#0f766e;
                   background:#f0fdf4;border:2px solid #bbf7d0;border-radius:10px;
                   padding:12px 28px;display:inline-block">${code}</span>
    </div>
    <p style="margin:0;font-size:12px;color:#6b7280;text-align:center">
      Expires in <strong>10 minutes</strong>. Never share this code.
    </p>
    <div style="margin-top:20px;padding:12px;background:#fef2f2;border-radius:8px;
                border:1px solid #fecaca">
      <p style="margin:0;font-size:11px;color:#b91c1c">
        If you did not request this change, contact your payroll administrator immediately
        and do not enter this code.
      </p>
    </div>
  </div>
</div></body></html>`,
  });
}

export async function sendConfirmationEmail(toEmail: string, action: string, last4: string): Promise<void> {
  try {
    const transporter = getMailTransporter();
    const from = `"Rail Payroll Security" <${process.env.GMAIL_USER}>`;
    const text: Record<string, string> = {
      add:    `A new bank account ending in ${last4} has been added for direct deposit`,
      delete: `The bank account ending in ${last4} has been removed from direct deposit`,
      update: `The bank account ending in ${last4} has been updated for direct deposit`,
    };
    await transporter.sendMail({
      from,
      to:      toEmail,
      subject: `Rail Payroll: Direct deposit settings changed`,
      text:    `${text[action] ?? 'Direct deposit settings changed'}. If this was not you, contact payroll immediately.`,
    });
  } catch { /* confirmation is non-critical — never block the main flow */ }
}

/** Mask an email for display: "kingr5183@gmail.com" → "ki***@gmail.com" */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

// ── SMS (primary) ─────────────────────────────────────────────────────────────
export async function sendOTPSms(phoneE164: string, code: string): Promise<void> {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    throw new Error(
      'Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in .env.local'
    );
  }

  const body =
    `Rail Payroll: Your direct deposit verification code is ${code}. ` +
    `It expires in 10 minutes. Never share this code. ` +
    `If you did not request this, contact your payroll administrator immediately.`;

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      },
      body: new URLSearchParams({ From: from, To: phoneE164, Body: body }).toString(),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { message?: string }).message ?? String(res.status);
    throw new Error(`SMS delivery failed: ${msg}`);
  }
}

export async function sendConfirmationSms(phoneE164: string, action: string, last4: string): Promise<void> {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return; // confirmation is non-critical

  const text: Record<string, string> = {
    add:    `A new bank account ending in ${last4} has been added for direct deposit`,
    update: `The bank account ending in ${last4} has been updated for direct deposit`,
    delete: `The bank account ending in ${last4} has been removed from direct deposit`,
  };

  const body = `Rail Payroll: ${text[action] ?? 'Direct deposit settings changed'}. If this was not you, contact payroll immediately.`;

  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      },
      body: new URLSearchParams({ From: from, To: phoneE164, Body: body }).toString(),
    }
  ).catch(() => { /* confirmation failure is non-fatal */ });
}

export function maskPhone(phoneE164: string): string {
  return phoneE164.replace(/\D/g, '').slice(-4);
}
