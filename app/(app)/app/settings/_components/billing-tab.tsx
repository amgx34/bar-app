import type { OrgBillingRow } from '@/lib/billing/store';

const STATUS: Record<string, string> = {
  active: 'Active', trialing: 'Trial', past_due: 'Payment failed', canceled: 'Cancelled',
  unpaid: 'Unpaid', incomplete: 'Incomplete', comped: 'Complimentary', none: 'No subscription',
};
const PLAN: Record<string, string> = { close: 'Close', whole_bar: 'Whole bar' };
const FLASH: Record<string, string> = {
  success: 'Thanks. Your subscription will show here in a moment.',
  cancelled: 'Checkout was cancelled. Nothing was charged.',
  unavailable: 'Billing is not switched on yet.',
  forbidden: 'Only the owner can manage billing.',
  already: 'This bar already has a subscription. Use Manage billing.',
  error: 'Something went wrong talking to Stripe. Try again.',
};

export function BillingTab({ billing, isOwner, configured, flash, isDemo }: {
  billing: OrgBillingRow | null; isOwner: boolean; configured: boolean; flash?: string; isDemo: boolean;
}) {
  const status = billing?.status ?? 'none';
  const subscribed = !!billing?.stripe_customer_id && status !== 'none';
  const renews = billing?.current_period_end
    ? new Date(billing.current_period_end).toLocaleDateString('en-US', { dateStyle: 'medium' }) : null;

  return (
    <section className="space-y-4" aria-labelledby="billing-h">
      <h2 id="billing-h" className="text-xl font-semibold">Billing</h2>
      {flash && FLASH[flash] && <p role="status" className="rounded-lg border bg-card p-3 text-sm">{FLASH[flash]}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border bg-card p-4 text-sm">
        <dt className="text-muted-foreground">Plan</dt><dd>{billing?.plan ? PLAN[billing.plan] : 'None'}</dd>
        <dt className="text-muted-foreground">Status</dt><dd>{STATUS[status] ?? status}</dd>
        <dt className="text-muted-foreground">{billing?.cancel_at_period_end ? 'Ends' : 'Next renewal'}</dt>
        <dd>{renews ?? 'Not applicable'}</dd>
      </dl>
      {isDemo && <p className="text-sm text-muted-foreground">Demo bars are free and cannot subscribe.</p>}
      {!isDemo && !configured && <p className="text-sm text-muted-foreground">Billing is not switched on for this Rail install yet. Nothing is charged.</p>}
      {!isDemo && configured && !isOwner && <p className="text-sm text-muted-foreground">Only the owner can change billing.</p>}
      {!isDemo && configured && isOwner && (
        subscribed ? (
          <form method="post" action="/api/billing/portal">
            <button className="min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground">Manage billing</button>
            <p className="mt-2 text-sm text-muted-foreground">Change plan, update your card or cancel on Stripe.</p>
          </form>
        ) : (
          <form method="post" action="/api/billing/checkout" className="flex flex-wrap gap-3">
            <button name="plan" value="close" className="min-h-11 rounded-lg border px-4 font-medium">Subscribe to Close</button>
            <button name="plan" value="whole_bar" className="min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground">Subscribe to Whole bar</button>
          </form>
        )
      )}
    </section>
  );
}
