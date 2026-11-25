'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { recordTermsAcceptance } from '@/lib/terms';
import { checkRateLimit, clientIp, RATE_LIMITS } from '@/lib/rate-limit';
import { barSlug, buildBarSettings, decideCreate } from '@/lib/setup/create-bar';
import { parsePrefill } from '@/lib/setup/prefill';
import { findOwnedBar } from '@/lib/setup/owned-bar';

export type SetupInput = {
  name:            string;
  /** Ticked on the setup form. The org is not created without it. */
  accepted_terms?: boolean;
  bar_type?:       string;
  bar_state?:      string;
  bar_city?:       string;
  /** IANA zone, used for the nightly close. */
  timezone?:       string;
};

/** Returned, not thrown: production Next replaces a thrown message with a generic one. */
export type SetupResult =
  | { ok: true; orgId: string; existing: boolean }
  | { ok: false; code: 'signed_out' | 'unverified' | 'terms' | 'name' | 'rate_limited' | 'failed'; message: string };

const fail = (code: Extract<SetupResult, { ok: false }>['code'], message: string): SetupResult => ({ ok: false, code, message });

// Each carries its cost classification from the start. Seeding a "Supplies"
// category without one is how napkins end up inside pour cost.
const DEFAULT_CATEGORIES: { name: string; cost_type: string }[] = [
  { name: 'Spirits',            cost_type: 'beverage_cogs' },
  { name: 'Beer',               cost_type: 'beverage_cogs' },
  { name: 'Wine',               cost_type: 'beverage_cogs' },
  { name: 'Mixers & Sodas',     cost_type: 'beverage_cogs' },
  { name: 'Coolers & Seltzers', cost_type: 'beverage_cogs' },
  { name: 'Supplies',           cost_type: 'supplies' },
  { name: 'Garnishes & Food',   cost_type: 'food_cogs' },
];

export async function createOrgWithSettings(data: SetupInput): Promise<SetupResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('signed_out', 'Sign in to create your bar.');

  const name = (data.name ?? '').trim().slice(0, 120);
  if (!name) return fail('name', 'Enter your bar name.');
  // Checked on the server, not just in the form: this is the moment a business
  // relationship starts, and the record of it has to be trustworthy.
  if (!data.accepted_terms) return fail('terms', 'Please accept the Terms of Service to create your bar.');

  // The verified-email and one-bar checks are plain reads that fail closed
  // (findOwnedBar throws). Only the IP limit below fails open, by design.
  let ownedBarId: string | null;
  try { ownedBarId = await findOwnedBar(user.id); }
  catch { return fail('failed', 'We could not create your bar. Nothing was charged. Try again.'); }

  const decision = decideCreate({ emailConfirmedAt: user.email_confirmed_at, ownedBarId });
  if (decision.kind === 'unverified') return fail('unverified', 'Verify your email first. Open the link we sent you, then come back.');
  if (decision.kind === 'existing') return { ok: true, orgId: decision.orgId, existing: true };

  const limit = await checkRateLimit(RATE_LIMITS.createOrg, clientIp(await headers()));
  if (!limit.allowed) return fail('rate_limited', 'Too many bars created from this connection today. Try again tomorrow, or contact us from the Rail website if you are stuck.');

  const admin = createAdminClient();
  const settings = buildBarSettings(
    { name, bar_type: data.bar_type || 'bar', bar_state: data.bar_state, bar_city: data.bar_city, timezone: data.timezone },
    parsePrefill((user.user_metadata as Record<string, unknown> | undefined)?.prefill),
  );

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name,
      slug: barSlug(name, Math.random().toString(36).slice(2, 7)),
      bar_type: settings.bar_type ?? 'bar',
      bar_address: [data.bar_city, data.bar_state].filter(Boolean).join(', ') || null,
      pos_provider: null,
      bar_settings: settings,
    })
    .select('id')
    .single();
  if (orgErr || !org) return fail('failed', 'We could not create your bar. Nothing was charged. Try again.');

  const { error: memberErr } = await admin
    .from('memberships')
    .insert({ user_id: user.id, organization_id: org.id, role: 'owner' });

  if (memberErr) {
    // admin-scope-ok: `org.id` is the row this very call just inserted; deleting
    // it by primary key cannot reach another bar. Without this the org is orphaned.
    await admin.from('organizations').delete().eq('id', org.id);
    return fail('failed', 'We could not create your bar. Nothing was charged. Try again.');
  }

  // Two tabs can both pass the check above. The oldest bar wins; the loser undoes itself.
  try {
    const winner = await findOwnedBar(user.id);
    if (winner && winner !== org.id) {
      await admin.from('memberships').delete().eq('organization_id', org.id);
      // admin-scope-ok: `org.id` was inserted by this call (see above).
      await admin.from('organizations').delete().eq('id', org.id);
      return { ok: true, orgId: winner, existing: true };
    }
  } catch { /* the bar exists and is ours; a failed re-check must not undo it */ }

  // After the membership so the acceptance can name the bar; before the seed steps,
  // which are best-effort, so a failed seed must not cost the consent record.
  await recordTermsAcceptance(org.id);
  await admin.from('inventory_categories').insert(
    DEFAULT_CATEGORIES.map((c) => ({ organization_id: org.id, ...c }))
  );

  revalidatePath('/app');
  return { ok: true, orgId: org.id, existing: false };
}

/** Re-sends the confirmation link to the signed-in, still-unconfirmed address. */
export async function resendConfirmation(): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, message: 'You are signed out. Sign in again to get a new link.' };
  if (user.email_confirmed_at) return { ok: true, message: 'Your email is already confirmed. Reload this page.' };

  const h = await headers();
  const limit = await checkRateLimit(RATE_LIMITS.signupResend, `resend:${user.id}`);
  if (!limit.allowed) return { ok: false, message: 'You have asked for a few links already. Check your spam folder, then try again in an hour.' };

  const origin = h.get('origin') ?? `https://${h.get('host')}`;
  const { error } = await supabase.auth.resend({
    type: 'signup', email: user.email, options: { emailRedirectTo: `${origin}/auth/confirm?next=/setup` },
  });
  if (error) return { ok: false, message: 'We could not send the link. Try again in a minute.' };
  return { ok: true, message: `Sent. Check ${user.email} and open the newest link.` };
}
