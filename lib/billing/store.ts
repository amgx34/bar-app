import { createAdminClient } from '@/lib/supabase/admin';
import { DEMO_SLUG_PREFIX } from '@/lib/demo/constants';
import { accessFor, type Access, type BillingRow } from './access';
import { enforcementOn } from './stripe';

export type OrgBillingRow = BillingRow & {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

/** Null when there is no row OR the table does not exist yet (migration not applied). */
export async function getOrgBilling(orgId: string): Promise<OrgBillingRow | null> {
  const { data, error } = await createAdminClient()
    .from('org_billing')
    .select('status, plan, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) return null;
  return data as OrgBillingRow | null;
}

export const isDemoOrg = (slug: string | null | undefined) => !!slug?.startsWith(DEMO_SLUG_PREFIX);

/** Never throws: any failure reads as "allowed", so billing can never lock a bar out by accident. */
export async function getOrgAccess(org: { id: string; slug: string }): Promise<Access> {
  const enforce = enforcementOn();
  if (!enforce || isDemoOrg(org.slug)) return accessFor(null, new Date(), { enforce: false, isDemo: isDemoOrg(org.slug) });
  try {
    return accessFor(await getOrgBilling(org.id), new Date(), { enforce, isDemo: false });
  } catch {
    return { allowed: true, state: 'not_enforced' };
  }
}
