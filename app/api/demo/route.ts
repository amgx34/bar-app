/**
 * POST /api/demo
 *
 * Signs the visitor in to the shared, read-only sample bars. Nothing is created
 * per visit: the demo user and its three bars are seeded once (and refreshed
 * daily) by lib/demo/universal-seed.ts, so entering is one sign-in.
 *
 * Deliberately POST, not GET: it sets a session cookie, and a GET fires on link
 * previews, prefetches and crawlers.
 */
import { createClient } from '@/lib/supabase/server';
import { UNIVERSAL_EMAIL } from '@/lib/demo/universal';
import { isDemoEmail, isUniversalDemoEmail } from '@/lib/demo/write-guard';
import { checkRateLimit, clientIp, RATE_LIMITS } from '@/lib/rate-limit';
import { BOT_BLOCKED_MESSAGE, isBotRequest } from '@/lib/auth/bot-check';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  if (await isBotRequest()) {
    return NextResponse.json({ error: BOT_BLOCKED_MESSAGE }, { status: 429 });
  }

  const limit = await checkRateLimit(RATE_LIMITS.demoCreate, clientIp(req.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many demo sessions from this address. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(limit.retryAfterSeconds, 1)) } },
    );
  }

  try {
    // Signing in below REPLACES the session cookie, so someone already signed in
    // to their own bar is sent to it instead of being signed out of it. Someone
    // already in the sample bar needs no second sign-in; an old per-visitor demo
    // session moves to the shared bar.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user && !isDemoEmail(user.email)) {
      return NextResponse.json({ redirectTo: '/app/dashboard', alreadySignedIn: true });
    }
    if (isUniversalDemoEmail(user?.email)) return NextResponse.json({ redirectTo: '/app/dashboard' });

    const password = process.env.DEMO_USER_PASSWORD;
    if (!password) {
      console.error('[demo] DEMO_USER_PASSWORD is not set; run the demo seed first.');
      return NextResponse.json({ error: 'The sample bar is unavailable right now.' }, { status: 503 });
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: UNIVERSAL_EMAIL, password,
    });
    if (error) {
      console.error('[demo] sign-in failed:', error.message);
      return NextResponse.json({ error: 'The sample bar is unavailable right now.' }, { status: 503 });
    }
    return NextResponse.json({ redirectTo: '/app/dashboard' });
  } catch (err) {
    console.error('[demo] error:', err);
    return NextResponse.json({ error: 'The sample bar is unavailable right now.' }, { status: 503 });
  }
}

/** Old links and bookmarks to this route get the marketing page, not a bare 405. */
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL('/?demo=use-button', new URL(req.url).origin));
}
