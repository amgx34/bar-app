'use server';

import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentOrg } from '@/lib/org';
import { isValidTimeZone } from '@/lib/pos/business-date';
import { cloverHosts, effectiveRegion, signState } from '@/lib/pos/providers/clover/auth';

/**
 * Starts the Clover redirect. Runs on the server so the nonce cookie and the
 * signed state are made together, and so the choices from the form are part of
 * what Clover hands back rather than something written before it has answered.
 */
export async function startCloverConnect(formData: FormData) {
  const { org, role } = await getCurrentOrg();
  if (role !== 'owner' && role !== 'manager') throw new Error('Only an owner or manager can connect Clover');

  const clientId = process.env.CLOVER_CLIENT_ID;
  const redirectUri = process.env.CLOVER_REDIRECT_URI;
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!clientId || !redirectUri || !secret) throw new Error('Clover is not configured on this server');

  const region = effectiveRegion(formData.get('region'));
  const cutoff = Math.min(12, Math.max(0, Math.trunc(Number(formData.get('cutoff_hour')) || 4)));
  const tzRaw = String(formData.get('timezone') ?? '');
  const nonce = randomBytes(16).toString('base64url');

  (await cookies()).set('clover_oauth_nonce', nonce, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/clover', maxAge: 600,
  });

  const url = new URL(`${cloverHosts(region).web}/oauth/v2/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', signState({
    o: org.id, r: region, c: cutoff, ...(isValidTimeZone(tzRaw) ? { tz: tzRaw } : {}),
    n: nonce, e: Date.now() + 10 * 60 * 1000,
  }, secret));
  redirect(url.toString());
}
