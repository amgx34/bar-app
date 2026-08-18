import { cache } from 'react';
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
  opener_bonus_type?:   'none' | 'fixed' | 'percentage' | 'hours';
  /** Dollars (fixed), percent of the pool (percentage), or hours (hours). */
  opener_bonus_value?:  number;

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

  // ── Sales tax ─────────────────────────────────────────────────────────────
  /** Percentage, e.g. 8.25. Unset means the books show no tax split at all. */
  sales_tax_rate?:          number;
  /**
   * Whether POS sales figures already contain tax. Cannot be inferred — a POS
   * "Net Sales" column means net of discounts, which says nothing about tax,
   * and the two readings differ by the whole tax amount.
   */
  pos_prices_include_tax?:  boolean;

  // ── ACH / NACHA payroll ───────────────────────────────────────────────────
  nacha_routing_number?: string;             // ODFI routing (bar's bank), 9 digits
  nacha_company_ein?:    string;             // 9-digit EIN without dashes
  nacha_bank_name?:      string;             // bar's bank name
  nacha_company_name?:   string;             // company name shown on employee statements
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
/**
 * The authenticated user, memoized for the current request.
 *
 * `supabase.auth.getUser()` is NOT a cookie read — it calls the Supabase Auth
 * API over the network to verify the JWT. It was being called three times per
 * page render (the app layout, getCurrentOrg inside that layout, and
 * getCurrentOrg again inside the page), which is three sequential network hops
 * for one answer that cannot change mid-render.
 *
 * React's cache() dedupes for the lifetime of a single request, so all three
 * now resolve from the first call.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/**
 * Memoized per request for the same reason: the app layout and the page it
 * renders both call this, and the membership query behind it is identical both
 * times. Without cache() every authenticated page paid for it twice.
 *
 * A redirect() thrown inside is memoized as a rejected promise and re-thrown on
 * the second call, which is the behaviour we want — the caller still redirects.
 */
export const getCurrentOrg = cache(async (): Promise<CurrentOrgResult> => {
  const supabase = await createClient();
  const user = await getAuthUser();
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
});
