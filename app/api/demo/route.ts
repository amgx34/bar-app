/**
 * GET /api/demo
 *
 * Creates a fresh demo user + org, seeds realistic inventory data,
 * signs in as that user (setting session cookies), and redirects to /app/inventory.
 *
 * Cleanup: at the start of every request, demo users older than DEMO_TTL_HOURS
 * are deleted (along with their organizations, which cascade to all child rows).
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { seedDemoOrg } from '@/lib/demo/seed';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

const DEMO_TTL_HOURS = 24;
const DEMO_EMAIL_SUFFIX = '@rail.demo';

// ── Cleanup expired demo accounts ────────────────────────────────────────────

async function purgeExpiredDemoUsers() {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - DEMO_TTL_HOURS * 60 * 60 * 1000).toISOString();

  // Collect all expired demo user IDs (paginated)
  const expiredIds: string[] = [];
  let page = 1;

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error || !data?.users?.length) break;

    for (const u of data.users) {
      if (u.email?.endsWith(DEMO_EMAIL_SUFFIX) && u.created_at < cutoff) {
        expiredIds.push(u.id);
      }
    }

    if (data.users.length < 100) break; // last page
    page++;
  }

  if (expiredIds.length === 0) return;

  // Delete their organizations first — cascades to all child tables
  // (inventory_items, z_report_days, employees, reps, weigh_reports, etc.)
  const { data: memberRows } = await admin
    .from('memberships')
    .select('organization_id')
    .in('user_id', expiredIds);

  const orgIds = [...new Set((memberRows ?? []).map((m) => m.organization_id))];
  if (orgIds.length > 0) {
    await admin.from('organizations').delete().in('id', orgIds);
  }

  // Delete the auth users themselves
  await Promise.allSettled(expiredIds.map((id) => admin.auth.admin.deleteUser(id)));

  console.log(`[demo] purged ${expiredIds.length} expired demo account(s)`);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;

  try {
    // Purge expired demos before creating a new one (non-blocking on failure)
    await purgeExpiredDemoUsers().catch((e) =>
      console.warn('[demo] purge error (non-fatal):', e),
    );

    const admin = createAdminClient();

    // ── 1. Create a fresh demo user ──────────────────────────────────────────
    const ts        = Date.now().toString(36);
    const demoEmail = `demo-${ts}${DEMO_EMAIL_SUFFIX}`;
    const demoPass  = randomUUID();

    const { data: { user }, error: createErr } = await admin.auth.admin.createUser({
      email:         demoEmail,
      password:      demoPass,
      email_confirm: true,
    });

    if (createErr || !user) {
      console.error('Demo user creation failed:', createErr?.message);
      return NextResponse.redirect(`${origin}/login?error=demo_unavailable`);
    }

    // ── 2. Seed demo org + data ──────────────────────────────────────────────
    await seedDemoOrg(admin, user.id);

    // ── 3. Sign in so the session cookie is set ───────────────────────────────
    const supabase = await createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email:    demoEmail,
      password: demoPass,
    });

    if (signInErr) {
      console.error('Demo sign-in failed:', signInErr.message);
      return NextResponse.redirect(`${origin}/login?error=demo_unavailable`);
    }

    // ── 4. Redirect into the app ──────────────────────────────────────────────
    return NextResponse.redirect(`${origin}/app/dashboard`);

  } catch (err) {
    console.error('Demo creation error:', err);
    return NextResponse.redirect(`${origin}/login?error=demo_unavailable`);
  }
}
