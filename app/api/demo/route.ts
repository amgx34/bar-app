/**
 * POST /api/demo
 *
 * Creates a fresh demo user + org, seeds realistic inventory data, signs in as
 * that user (setting session cookies), and returns the URL to land on.
 *
 * Deliberately POST, not GET. Provisioning an auth user, an organisation and a
 * seeded dataset is about as state-changing as a request gets, and as a GET it
 * fired on link previews, prefetches and crawlers — robots.txt is advisory and
 * does not stop any of them.
 *
 * Expired demos are swept by GET /api/cron/2touch, not here: the purge paged
 * through every auth user in the project, so the cost of one visitor's request
 * grew with the size of the user table.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { seedDemoOrg } from '@/lib/demo/seed';
import { DEMO_EMAIL_SUFFIX, DEMO_SLUG_PREFIX } from '@/lib/demo/constants';
import { recordTermsAcceptanceForUser } from '@/lib/terms';
import { checkRateLimit, clientIp, RATE_LIMITS } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

export const DEMO_TTL_HOURS = 24;
export { DEMO_EMAIL_SUFFIX, DEMO_SLUG_PREFIX } from '@/lib/demo/constants';

/**
 * Ceiling on demo orgs alive at once. The per-IP limit alone does not bound
 * total cost — a botnet spreads across addresses — so this caps the blast
 * radius on the database regardless of where requests come from.
 */
const MAX_LIVE_DEMO_ORGS = 250;

function fail(reason: string, status: number) {
  return NextResponse.json({ error: reason }, { status });
}

export async function POST(req: NextRequest) {
  // ── 0. Bound the abuse ────────────────────────────────────────────────────
  const ip = clientIp(req.headers);
  const limit = await checkRateLimit(RATE_LIMITS.demoCreate, ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many demo sessions from this address. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(limit.retryAfterSeconds, 1)) } },
    );
  }

  try {
    // ── Never take over a real session ───────────────────────────────────────
    //
    // signInWithPassword below REPLACES whatever session cookie is present. An
    // operator already signed in to their own bar who clicked "Try Demo" was
    // therefore silently signed out of it and into a throwaway demo user — one
    // the 24-hour purge then deletes. From their seat their account and the
    // demo had merged.
    //
    // Anyone already signed in has no use for a demo, so send them to their own
    // dashboard and provision nothing.
    const existing = await createClient();
    const { data: { user: signedIn } } = await existing.auth.getUser();

    if (signedIn && !signedIn.email?.endsWith(DEMO_EMAIL_SUFFIX)) {
      return NextResponse.json({
        redirectTo: '/app/dashboard',
        alreadySignedIn: true,
      });
    }

    const admin = createAdminClient();

    // Counting orgs by slug prefix is one indexed query; counting auth users
    // would page through the whole project.
    const { count, error: countErr } = await admin
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .like('slug', `${DEMO_SLUG_PREFIX}%`);

    if (!countErr && (count ?? 0) >= MAX_LIVE_DEMO_ORGS) {
      console.warn(`[demo] refused: ${count} live demo orgs >= cap ${MAX_LIVE_DEMO_ORGS}`);
      return fail('Demo capacity is full right now. Please try again shortly.', 503);
    }

    // ── 1. Create a fresh demo user ──────────────────────────────────────────
    const ts        = Date.now().toString(36);
    const demoEmail = `demo-${ts}-${randomUUID().slice(0, 8)}${DEMO_EMAIL_SUFFIX}`;
    const demoPass  = randomUUID();

    const { data: { user }, error: createErr } = await admin.auth.admin.createUser({
      email:         demoEmail,
      password:      demoPass,
      email_confirm: true,
    });

    if (createErr || !user) {
      console.error('Demo user creation failed:', createErr?.message);
      return fail('Demo is unavailable right now.', 503);
    }

    // ── 2. Seed demo org + data ──────────────────────────────────────────────
    const demoOrgId = await seedDemoOrg(admin, user.id);

    // Recorded here rather than left to the /app consent gate, which would put
    // a wall in front of the demo the moment someone clicked "try it". The demo
    // form states that continuing accepts the terms, so this is the record of
    // that — and it is a real record, not a bypass.
    await recordTermsAcceptanceForUser(user.id, demoOrgId);

    // ── 3. Sign in so the session cookie is set ───────────────────────────────
    const supabase = await createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email:    demoEmail,
      password: demoPass,
    });

    if (signInErr) {
      console.error('Demo sign-in failed:', signInErr.message);
      return fail('Demo is unavailable right now.', 503);
    }

    // The client navigates; returning a URL keeps this a POST end to end.
    return NextResponse.json({ redirectTo: '/app/dashboard' });

  } catch (err) {
    console.error('Demo creation error:', err);
    return fail('Demo is unavailable right now.', 503);
  }
}

/**
 * The route used to be a GET. Anything still linking to it — an old bookmark,
 * a cached page — gets sent to the marketing page rather than a bare 405.
 */
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL('/?demo=use-button', new URL(req.url).origin));
}
