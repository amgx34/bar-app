import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

const CLOVER_API =
  process.env.CLOVER_SANDBOX === 'true'
    ? 'https://apisandbox.dev.clover.com'
    : 'https://api.clover.com';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // org_id passed when initiating OAuth

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/app/settings?error=clover_missing_params`);
  }

  // Verify the user is authenticated and is a member of the org in state
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('organization_id', state)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'manager'].includes(membership.role)) {
    return NextResponse.redirect(`${origin}/app/settings?error=clover_unauthorized`);
  }

  // Exchange authorization code for access token
  const tokenRes = await fetch(`${CLOVER_API}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.CLOVER_CLIENT_ID!,
      client_secret: process.env.CLOVER_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error('Clover token exchange failed:', body);
    return NextResponse.redirect(`${origin}/app/settings?error=clover_token_failed`);
  }

  const token = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    merchant_id: string;
  };

  if (!token.access_token || !token.merchant_id) {
    return NextResponse.redirect(`${origin}/app/settings?error=clover_invalid_token`);
  }

  // Store connection in org — use admin client to bypass RLS
  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update({
      pos_provider: 'clover',
      pos_config: {
        merchant_id: token.merchant_id,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        expires_at: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
      },
    })
    .eq('id', state);

  if (error) {
    console.error('Failed to store Clover config:', error.message);
    return NextResponse.redirect(`${origin}/app/settings?error=clover_save_failed`);
  }

  return NextResponse.redirect(`${origin}/app/dashboard?connected=clover`);
}
