/**
 * GET /api/clover/callback — the end of Clover's OAuth v2 redirect.
 *
 * The `state` is HMAC-signed (OAUTH_STATE_SECRET) and paired with a nonce
 * cookie, so a forged link cannot attach someone else's Clover account to a
 * bar. It also carries the region, cutoff hour and time zone chosen on the
 * setup page, which means nothing is written to the org until Clover has
 * answered and the whole connection is valid.
 *
 * The token pair goes to the encrypted credentials store, never to pos_config.
 */

import { after, NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { saveCredentials } from '@/lib/pos/credentials';
import { applyProviderSettings, type PosConfig } from '@/lib/pos/pos-config';
import { isValidTimeZone } from '@/lib/pos/business-date';
import { runProviderSync } from '@/lib/pos/sync-run';
import { cloverHosts, effectiveRegion, exchangeCode, verifyState } from '@/lib/pos/providers/clover/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NONCE_COOKIE = 'clover_oauth_nonce';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${origin}/app/settings?tab=pos&${q}`);

  const code = searchParams.get('code');
  const merchantId = searchParams.get('merchant_id');
  const secret = process.env.OAUTH_STATE_SECRET;
  const state = secret ? verifyState(searchParams.get('state'), secret) : null;
  if (!code || !merchantId || !state) return back('error=clover_missing_params');

  const jar = await cookies();
  const nonce = jar.get(NONCE_COOKIE)?.value;
  jar.delete({ name: NONCE_COOKIE, path: '/api/clover' });
  if (!nonce || nonce !== state.n) return back('error=clover_missing_params');

  // The person finishing the flow must still own or manage the org in the state.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('organization_id', state.o)
    .eq('user_id', user.id)
    .single();
  if (!membership || !['owner', 'manager'].includes(membership.role)) return back('error=clover_unauthorized');

  const region = effectiveRegion(state.r);
  let secrets;
  try {
    secrets = await exchangeCode(region, code);
  } catch (e) {
    console.error('[clover] token exchange failed:', e instanceof Error ? e.message : e);
    return back('error=clover_token_failed');
  }

  // Read the merchant's time zone. Clover has no business day, so a wrong zone
  // would shift every night; without one the connection is saved but not usable.
  let timezone: string | null = null;
  try {
    const res = await fetch(`${cloverHosts(region).api}/v3/merchants/${encodeURIComponent(merchantId)}`, {
      headers: { Authorization: `Bearer ${secrets.access_token as string}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const m = (await res.json()) as { timezone?: unknown; timeZone?: unknown };
      const tz = m.timezone ?? m.timeZone;
      if (isValidTimeZone(tz)) timezone = tz;
    }
  } catch { /* falls through to the zone chosen at setup */ }
  timezone ??= isValidTimeZone(state.tz) ? state.tz : null;

  const admin = createAdminClient();
  try {
    await saveCredentials(admin, state.o, { provider: 'clover', externalId: merchantId, secrets });

    // admin-scope-ok: `organizations` is keyed by id, and state.o was signed by
    // this server and checked against the caller's membership above.
    const { data: org } = await admin.from('organizations').select('pos_provider, pos_config').eq('id', state.o).single();
    const latest = (org?.pos_config ?? {}) as PosConfig;
    // Switching provider restarts the config. Sales history and stock ledgers are other tables.
    const base: PosConfig = org?.pos_provider === 'clover'
      ? { ...latest }
      : latest.credentials_enc ? { credentials_enc: latest.credentials_enc } : {};
    delete base.access_token; // the plaintext key older connections kept
    delete base.expires_at;
    const next = applyProviderSettings(base, {
      merchant_id: merchantId,
      clover_region: region,
      cutoff_hour: state.c,
      ...(timezone ? { timezone } : {}),
      needs_reauth: false,
    });
    // admin-scope-ok: same as above, a row keyed by the verified org id.
    const { error } = await admin.from('organizations').update({ pos_provider: 'clover', pos_config: next }).eq('id', state.o);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error('[clover] could not store connection:', e instanceof Error ? e.message : e);
    return back('error=clover_save_failed');
  }

  if (!timezone) return back('error=clover_timezone');

  // First pull right away so the bar is not looking at an empty dashboard until the nightly cron.
  after(() => runProviderSync(state.o).catch((e) => console.error('[clover] first sync failed:', e)));
  return back('connected=clover');
}
