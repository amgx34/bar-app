import { createClient } from '@/lib/supabase/server';
import { authErrorCode } from '@/lib/auth/errors';
import { safeNext } from '@/lib/auth/safe-next';
import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

const TYPES: readonly EmailOtpType[] = ['signup', 'magiclink', 'email', 'recovery', 'invite', 'email_change'];

/**
 * Email link that works in any browser: the token hash is verified here, so no
 * PKCE verifier from the browser that asked for it is needed. The Supabase
 * email templates point at this route.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNext(searchParams.get('next'), '/app/dashboard');

  if (!tokenHash || !type || !TYPES.includes(type)) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${authErrorCode(error)}`);
  }

  const { data: memberships } = await supabase
    .from('memberships')
    .select('organization_id')
    .limit(1);

  if (!memberships || memberships.length === 0) {
    return NextResponse.redirect(`${origin}/setup`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
