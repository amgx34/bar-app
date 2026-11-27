import { createAdminClient } from '@/lib/supabase/admin';
import { DEMO_SLUG_PREFIX, UNIVERSAL_SLUG_PREFIX } from '@/lib/demo/constants';
import { accessFor, accessFromLookup, type Access, type BillingRow } from './access';
import { enforcementOn } from './stripe';

export type OrgBillingRow = BillingRow & {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

/** `failed` separates a query error (missing table, blip) from a genuine absence of a row. */
export async function getOrgBillingLookup(orgId: string): Promise<{ row: OrgBillingRow | null; failed: boolean }> {
  const { data, error } = await createAdminClient()
    .from('org_billing')
    .select('status, plan, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) {
    console.error('[billing/store] org_billing lookup failed', orgId, error.message);
    return { row: null, failed: true };
  }
  return { row: data as OrgBillingRow | null, failed: false };
}

/** Null when there is no row OR the lookup failed; callers that gate access use getOrgAccess. */
export async function getOrgBilling(orgId: string): Promise<OrgBillingRow | null> {
  return (await getOrgBillingLookup(orgId)).row;
}

export const isDemoOrg = (slug: string | null | undefined) => !!slug && (slug.startsWith(DEMO_SLUG_PREFIX) || slug.startsWith(UNIVERSAL_SLUG_PREFIX));

/** Never throws: any failure reads as "allowed", so billing can never lock a bar out by accident. */
export async function getOrgAccess(org: { id: string; slug: string }): Promise<Access> {
  const enforce = enforcementOn();
  if (!enforce || isDemoOrg(org.slug)) return accessFor(null, new Date(), { enforce: false, isDemo: isDemoOrg(org.slug) });
  try {
    return accessFromLookup(await getOrgBillingLookup(org.id), new Date(), { enforce, isDemo: false });
  } catch {
    return { allowed: true, state: 'not_enforced' };
  }
}
