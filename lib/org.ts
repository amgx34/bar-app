import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const CURRENT_ORG_COOKIE = 'current_org_id';

export type HourlyRates = {
  bartender?: number;
  barback?:   number;
  manager?:   number;
  server?:    number;
  security?:  number;
  other?:     number;
};

export type BarSettings = {
  // ── Existing ──────────────────────────────────────────────────────────
  tip_split_percent:   number;
  default_hourly_rate: number;
  auto_reorder_enabled?: boolean;
  admin_phone?:          string;

  // ── Tip configuration ─────────────────────────────────────────────────
  barback_tip_pct?:     number;              // % of nightly tip pool to barbacks (default 15)
  opener_bonus_type?:   'none' | 'fixed' | 'percentage';
  opener_bonus_value?:  number;              // dollars (fixed) or % (percentage)

  // ── Per-role hourly rates ─────────────────────────────────────────────
  hourly_rates?: HourlyRates;

  // ── Inventory / pour defaults ─────────────────────────────────────────
  default_pour_oz?: number;                  // default spirit pour size in oz (e.g. 1.5)
  bottle_sizes_ml?: number[];               // sizes to offer in item form

  // ── Bar identity ──────────────────────────────────────────────────────
  bar_type?:    string;                      // bar | nightclub | restaurant | brewery | etc.
  bar_address?: string;
  bar_city?:    string;
  bar_state?:   string;
  bar_phone?:   string;
};

export type OrgMembership = {
  organization_id: string;
  role: 'owner' | 'manager' | 'accountant';
  organizations: {
    id: string;
    name: string;
    slug: string;
    pos_provider: 'clover' | 'toast' | '2touch' | null;
    pos_config: Record<string, unknown>;
    bar_settings: BarSettings;
  };
};

export type CurrentOrgResult = {
  org: OrgMembership['organizations'];
  role: OrgMembership['role'];
  allMemberships: OrgMembership[];
};

/**
 * Returns the current user's active org + their role + all their memberships.
 * If the user has no memberships, redirects to /setup.
 */
export async function getCurrentOrg(): Promise<CurrentOrgResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: raw, error } = await supabase
    .from('memberships')
    .select('organization_id, role, organizations(id, name, slug, pos_provider, pos_config, bar_settings)')
    .order('created_at', { ascending: true });

  const memberships = raw as OrgMembership[] | null;

  if (error) throw error;
  if (!memberships || memberships.length === 0) redirect('/setup');

  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(CURRENT_ORG_COOKIE)?.value;

  const active = memberships.find((m) => m.organization_id === cookieOrgId) ?? memberships[0];

  return {
    org: active.organizations,
    role: active.role,
    allMemberships: memberships,
  };
}
