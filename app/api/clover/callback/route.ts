import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

const CLOVER_BASE =
  process.env.CLOVER_SANDBOX === 'true'
    ? 'https://sandbox.dev.clover.com'
    : 'https://www.clover.com';

const CLOVER_API =
  process.env.CLOVER_SANDBOX === 'true'
    ? 'https://apisandbox.dev.clover.com'
    : 'https://api.clover.com';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code       = searchParams.get('code');
  const merchantId = searchParams.get('merchant_id'); // Clover includes this directly
  const state      = searchParams.get('state'); // org_id we passed when initiating

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/app/settings?tab=pos&error=clover_missing_params`);
  }

  // Verify the requesting user is an owner/manager of that org
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('organization_id', state)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'manager'].includes(membership.role)) {
    return NextResponse.redirect(`${origin}/app/settings?tab=pos&error=clover_unauthorized`);
  }

  // ── Token exchange ────────────────────────────────────────────────────────
  // Prefer OAuth v2 (requires client_secret). Fall back to v1 (App ID only)
  // when CLOVER_CLIENT_SECRET is not configured.

  let accessToken: string | null = null;
  let resolvedMerchantId: string | null = merchantId;

  const clientId     = process.env.CLOVER_CLIENT_ID!;
  const clientSecret = process.env.CLOVER_CLIENT_SECRET;
  const redirectUri  = process.env.CLOVER_REDIRECT_URI!;

  if (clientSecret) {
    // v2 OAuth (recommended for production)
    const tokenRes = await fetch(`${CLOVER_API}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     clientId,
        client_secret: clientSecret,
        code,
        redirect_uri:  redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      console.error('Clover v2 token exchange failed:', await tokenRes.text());
      return NextResponse.redirect(`${origin}/app/settings?tab=pos&error=clover_token_failed`);
    }

    const json = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      merchant_id?: string;
    };
    accessToken         = json.access_token ?? null;
    resolvedMerchantId  = json.merchant_id ?? merchantId;
  } else {
    // v1 OAuth fallback — App ID + code only (no secret needed)
    const tokenRes = await fetch(
      `${CLOVER_BASE}/oauth/token?client_id=${clientId}&code=${code}`,
    );

    if (!tokenRes.ok) {
      console.error('Clover v1 token exchange failed:', await tokenRes.text());
      return NextResponse.redirect(`${origin}/app/settings?tab=pos&error=clover_token_failed`);
    }

    const json = await tokenRes.json() as { access_token?: string; merchant_id?: string };
    accessToken        = json.access_token ?? null;
    resolvedMerchantId = json.merchant_id ?? merchantId;
  }

  if (!accessToken) {
    return NextResponse.redirect(`${origin}/app/settings?tab=pos&error=clover_invalid_token`);
  }

  // Resolve merchant ID from Clover API if still unknown
  if (!resolvedMerchantId) {
    try {
      const meRes = await fetch(`${CLOVER_API}/v3/merchant`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (meRes.ok) {
        const me = await meRes.json() as { id?: string };
        resolvedMerchantId = me.id ?? null;
      }
    } catch { /* best-effort */ }
  }

  if (!resolvedMerchantId) {
    return NextResponse.redirect(`${origin}/app/settings?tab=pos&error=clover_invalid_token`);
  }

  // ── Persist connection ────────────────────────────────────────────────────
  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update({
      pos_provider: 'clover',
      pos_config: {
        merchant_id:   resolvedMerchantId,
        access_token:  accessToken,
      },
    })
    .eq('id', state);

  if (error) {
    console.error('Failed to store Clover config:', error.message);
    return NextResponse.redirect(`${origin}/app/settings?tab=pos&error=clover_save_failed`);
  }

  return NextResponse.redirect(`${origin}/app/settings?tab=pos&connected=clover`);
}
