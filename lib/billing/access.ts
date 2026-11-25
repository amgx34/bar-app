/**
 * Pure billing rules: what a Stripe subscription lets an org do, and how a
 * Stripe subscription object maps onto our stored row. No network, no clock
 * (callers pass `now`).
 */

export type Plan = 'close' | 'whole_bar';

export type BillingRow = {
  status: string;               // Stripe status, 'none', or 'comped'
  plan: Plan | null;
  current_period_end: string | null;
  cancel_at_period_end?: boolean;
};

export type Access =
  | { allowed: true;  state: 'active' | 'trialing' | 'comped' | 'past_due_grace' | 'exempt' | 'not_enforced'; graceEndsAt?: Date }
  | { allowed: false; state: 'past_due_expired' | 'cancelled' | 'incomplete' | 'none' };

/** Days a bar keeps working after a failed renewal before it is blocked. */
export const GRACE_DAYS = 7;
const DAY = 86_400_000;

export function accessFor(
  row: BillingRow | null,
  now: Date,
  opts: { enforce: boolean; isDemo: boolean },
): Access {
  if (opts.isDemo) return { allowed: true, state: 'exempt' };
  const status = row?.status ?? 'none';
  if (status === 'comped') return { allowed: true, state: 'comped' };
  if (status === 'active') return { allowed: true, state: 'active' };
  if (status === 'trialing') return { allowed: true, state: 'trialing' };
  if (status === 'past_due' || status === 'unpaid') {
    // Grace runs from the end of the period that failed to renew.
    const end = row?.current_period_end ? new Date(row.current_period_end) : null;
    const graceEndsAt = end ? new Date(end.getTime() + GRACE_DAYS * DAY) : null;
    if (graceEndsAt && now < graceEndsAt && status === 'past_due') {
      return { allowed: true, state: 'past_due_grace', graceEndsAt };
    }
    if (!opts.enforce) return { allowed: true, state: 'not_enforced' };
    return { allowed: false, state: 'past_due_expired' };
  }
  if (!opts.enforce) return { allowed: true, state: 'not_enforced' };
  if (status === 'canceled') return { allowed: false, state: 'cancelled' };
  if (status === 'incomplete' || status === 'incomplete_expired' || status === 'paused') {
    return { allowed: false, state: 'incomplete' };
  }
  return { allowed: false, state: 'none' };
}

type StripeSub = {
  id?: string;
  customer?: string | { id: string };
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ current_period_end?: number; price?: { id?: string } }> };
};

export type PriceMap = Record<string, Plan>;

/** Stripe subscription -> stored fields. Price ids come from env, never amounts. */
export function subscriptionToRow(sub: StripeSub, prices: PriceMap) {
  const item = sub.items?.data?.[0];
  // Newer API versions moved current_period_end onto the item.
  const end = item?.current_period_end ?? sub.current_period_end;
  return {
    organization_id: sub.metadata?.organization_id ?? null,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
    stripe_subscription_id: sub.id ?? null,
    status: sub.status ?? 'none',
    plan: (item?.price?.id && prices[item.price.id]) || null,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
  };
}
