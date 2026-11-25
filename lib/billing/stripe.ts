import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Plan, PriceMap } from './access';

/** Billing is a no-op until a secret key exists. */
export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;
export const enforcementOn = () => process.env.BILLING_ENFORCE === 'true';

export function planPrices(): Record<Plan, string | undefined> {
  return { close: process.env.STRIPE_PRICE_CLOSE, whole_bar: process.env.STRIPE_PRICE_WHOLE_BAR };
}
export function priceMap(): PriceMap {
  const out: PriceMap = {};
  for (const [plan, id] of Object.entries(planPrices())) if (id) out[id] = plan as Plan;
  return out;
}

/** Form-encode nested params the way Stripe expects: a[b][0]=c. */
export function encodeParams(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) return [];
    if (typeof v === 'object') return encodeParams(v as Record<string, unknown>, key);
    return [`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`];
  });
}

export async function stripeApi<T = Record<string, unknown>>(
  method: 'GET' | 'POST', path: string, params: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'POST' ? encodeParams(params).join('&') : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${json?.error?.message ?? res.status}`);
  return json as T;
}

/** Manual Stripe-Signature check: HMAC-SHA256 over `${t}.${rawBody}`, any v1 may match, 5 minute tolerance. */
export function verifyStripeSignature(
  rawBody: string, header: string | null, secret: string,
  nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300,
): boolean {
  if (!header || !secret) return false;
  let t = '';
  const sigs: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    const k = part.slice(0, i), v = part.slice(i + 1);
    if (k === 't') t = v; else if (k === 'v1') sigs.push(v);
  }
  if (!t || sigs.length === 0 || Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  return sigs.some((s) => {
    const b = Buffer.from(s, 'hex');
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
}
