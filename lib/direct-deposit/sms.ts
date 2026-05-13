/**
 * Twilio SMS via REST API — no SDK dependency needed.
 * Never log the OTP code itself.
 */
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
