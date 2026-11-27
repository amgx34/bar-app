import { createClient } from '@/lib/supabase/server';
import { authErrorCode } from '@/lib/auth/errors';
import { safeNext } from '@/lib/auth/safe-next';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'), '/app/dashboard');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${authErrorCode(error)}`);
    }

    // New users with no org go through the setup wizard
    const { data: memberships } = await supabase
      .from('memberships')
      .select('organization_id')
      .limit(1);

    if (!memberships || memberships.length === 0) {
      return NextResponse.redirect(`${origin}/setup`);
    }

    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
