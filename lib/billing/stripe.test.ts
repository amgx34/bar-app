import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyStripeSignature, encodeParams } from './stripe';

const secret = 'whsec_test';
const body = '{"id":"evt_1"}';
const sign = (t: number, b = body) => createHmac('sha256', secret).update(`${t}.${b}`).digest('hex');

describe('verifyStripeSignature', () => {
  const now = 1_800_000_000;
  it('accepts a valid signature, including among several v1 entries', () => {
    expect(verifyStripeSignature(body, `t=${now},v1=${sign(now)}`, secret, now)).toBe(true);
    expect(verifyStripeSignature(body, `t=${now},v1=deadbeef,v1=${sign(now)},v0=zz`, secret, now)).toBe(true);
  });
  it('rejects a tampered body, wrong secret, stale timestamp and missing header', () => {
    expect(verifyStripeSignature(body + ' ', `t=${now},v1=${sign(now)}`, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now},v1=${sign(now)}`, 'other', now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now - 600},v1=${sign(now - 600)}`, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
  });
});

describe('encodeParams', () => {
  it('nests arrays and objects', () => {
    expect(encodeParams({ mode: 'subscription', line_items: [{ price: 'p', quantity: 1 }] }))
      .toEqual(['mode=subscription', 'line_items%5B0%5D%5Bprice%5D=p', 'line_items%5B0%5D%5Bquantity%5D=1']);
  });
});
