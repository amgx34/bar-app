/**
 * GET /api/demo
 *
 * Creates a fresh demo user + org, seeds realistic inventory data,
 * signs in as that user (setting session cookies), and redirects to /app/inventory.
 *
 * Required env:  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *                SUPABASE_SERVICE_ROLE_KEY
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { seedDemoOrg } from '@/lib/demo/seed';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;

  try {
    const admin = createAdminClient();

    // ── 1. Create a fresh demo user ──────────────────────────────────────────
    const ts       = Date.now().toString(36);
    const demoEmail = `demo-${ts}@rail.demo`;
    const demoPass  = randomUUID();

    const { data: { user }, error: createErr } = await admin.auth.admin.createUser({
      email:         demoEmail,
      password:      demoPass,
      email_confirm: true,  // skip email verification
    });

    if (createErr || !user) {
      console.error('Demo user creation failed:', createErr?.message);
      return NextResponse.redirect(`${origin}/login?error=demo_unavailable`);
    }

    // ── 2. Seed demo org + data ──────────────────────────────────────────────
    await seedDemoOrg(admin, user.id);

    // ── 3. Sign in as demo user so the session cookie is set ─────────────────
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
    return NextResponse.redirect(`${origin}/app/inventory?demo=1`);

  } catch (err) {
    console.error('Demo creation error:', err);
    return NextResponse.redirect(`${origin}/login?error=demo_unavailable`);
  }
}
