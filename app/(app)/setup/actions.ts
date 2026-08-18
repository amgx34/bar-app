'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { HourlyRates } from '@/lib/org';
import { recordTermsAcceptance } from '@/lib/terms';

export type SetupInput = {
  name:               string;
  /** Ticked on the setup form. The org is not created without it. */
  accepted_terms?:    boolean;
  bar_type?:          string;
  bar_state?:         string;
  bar_city?:          string;
  tip_split_percent:  number;
  barback_tip_pct?:   number;
  default_hourly_rate: number;
  hourly_rates?:      HourlyRates;
  default_pour_oz?:   number;
};

// ── Default inventory categories seeded for every new org ─────────────────────
// Each carries its cost classification from the start. Seeding a "Supplies"
// category without one is how napkins end up inside pour cost — the exact bug
// migration 20260818000000 had to go back and repair.
const DEFAULT_CATEGORIES: { name: string; cost_type: string }[] = [
  { name: 'Spirits',            cost_type: 'beverage_cogs' },
  { name: 'Beer',               cost_type: 'beverage_cogs' },
  { name: 'Wine',               cost_type: 'beverage_cogs' },
  { name: 'Mixers & Sodas',     cost_type: 'beverage_cogs' },
  { name: 'Coolers & Seltzers', cost_type: 'beverage_cogs' },
  { name: 'Supplies',           cost_type: 'supplies' },
  { name: 'Garnishes & Food',   cost_type: 'food_cogs' },
];

// ── Default reps seeded as examples (user can edit/delete) ────────────────────
const DEFAULT_REPS = [
  { name: 'Your Spirits Rep', company: '', phone: '', email: '', notes: 'Edit with your actual rep\'s details' },
  { name: 'Your Beer / Beverage Rep', company: '', phone: '', email: '', notes: 'Edit with your actual rep\'s details' },
];

export async function createOrgWithSettings(data: SetupInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Checked on the server, not just in the form: this is the moment a business
  // relationship starts, and the record of it has to be trustworthy.
  if (!data.accepted_terms) {
    throw new Error('Please accept the Terms of Service to create your bar');
  }

  const admin = createAdminClient();

  const slug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) + '-' + Math.random().toString(36).slice(2, 7);

  // ── Create org ────────────────────────────────────────────────────────────
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name:     data.name.trim(),
      slug,
      bar_type: data.bar_type ?? 'bar',
      bar_address: [data.bar_city, data.bar_state].filter(Boolean).join(', ') || null,
      pos_provider: null,
      bar_settings: {
        tip_split_percent:  data.tip_split_percent,
        barback_tip_pct:    data.barback_tip_pct ?? 15,
        default_hourly_rate: data.default_hourly_rate,
        hourly_rates:       data.hourly_rates ?? {},
        default_pour_oz:    data.default_pour_oz ?? 1.5,
        bar_type:           data.bar_type ?? 'bar',
        bar_state:          data.bar_state ?? '',
        bar_city:           data.bar_city ?? '',
        auto_reorder_enabled: false,
        opener_bonus_type:  'none',
        opener_bonus_value: 0,
      },
    })
    .select()
    .single();

  if (orgErr) throw new Error(orgErr.message);

  // ── Create owner membership ───────────────────────────────────────────────
  const { error: memberErr } = await admin
    .from('memberships')
    .insert({ user_id: user.id, organization_id: org.id, role: 'owner' });

  if (memberErr) throw new Error(memberErr.message);

  // Recorded after the membership so the acceptance can name the bar it was
  // made for. Before the seed steps, which are best-effort — a failed rep
  // insert must not cost us the consent record.
  await recordTermsAcceptance(org.id);

  // ── Seed default categories (best-effort, non-blocking) ───────────────────
  await admin.from('inventory_categories').insert(
    DEFAULT_CATEGORIES.map((c) => ({ organization_id: org.id, ...c }))
  );

  // ── Seed example reps (best-effort) ───────────────────────────────────────
  await admin.from('reps').insert(
    DEFAULT_REPS.map((r) => ({ ...r, organization_id: org.id }))
  );

  revalidatePath('/app');
  return org;
}
