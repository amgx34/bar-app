/**
 * POST /api/clover/webhook — Clover tells us a merchant's orders changed.
 *
 * A hint, never the source of truth: the payload carries ids only, so an event
 * just triggers a refetch of the last few business dates through the same
 * runProviderSync the cron and "Sync now" use. The cron and the on-view refresh
 * do not depend on it. Inert (404) until CLOVER_WEBHOOK_KEY is set, because a
 * Clover app needs approval before webhooks are delivered at all.
 */

import { after, NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { runProviderSync } from '@/lib/pos/sync-run';
import { syncCooldownMessage } from '@/lib/pos/sync-cooldown';

export const runtime = 'nodejs';
export const maxDuration = 60;

function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const key = process.env.CLOVER_WEBHOOK_KEY;
  if (!key) return new NextResponse(null, { status: 404 });

  let body: { verificationCode?: unknown; merchants?: unknown } = {};
  try { body = await req.json(); } catch { /* an empty or malformed body falls through to the auth check */ }

  // Clover's one-time handshake: it posts a code that the owner then types into
  // the Clover dashboard. It changes nothing here, so it is answered before the
  // key check and the code goes to the log where the owner can read it.
  if (typeof body.verificationCode === 'string') {
    console.log('[clover/webhook] verification code:', body.verificationCode);
    return NextResponse.json({ ok: true });
  }

  if (!sameSecret(req.headers.get('x-clover-auth'), key)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const merchantIds = body.merchants && typeof body.merchants === 'object' ? Object.keys(body.merchants).slice(0, 20) : [];
  const admin = createAdminClient();
  for (const merchantId of merchantIds) {
    // admin-scope-ok: this lookup IS the routing step, from a Clover merchant id to
    // its org. Everything after it uses that org's id only.
    const { data: org } = await admin
      .from('organizations')
      .select('id, pos_config')
      .eq('pos_provider', 'clover')
      .eq('pos_config->>merchant_id', merchantId)
      .maybeSingle();
    if (!org) continue;
    // One order fires several events; a refetch inside the cooldown would only repeat the last one.
    if (syncCooldownMessage((org.pos_config ?? {}) as Record<string, unknown>, new Date())) continue;
    after(() => runProviderSync(org.id, { days: 1 }).catch((e) => console.warn('[clover/webhook] sync failed:', e)));
  }
  return NextResponse.json({ ok: true });
}
