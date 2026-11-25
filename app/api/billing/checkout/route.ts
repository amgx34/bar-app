import { NextResponse, type NextRequest } from 'next/server';
import { getAuthUser, getCurrentOrg } from '@/lib/org';
import { getOrgBilling, isDemoOrg } from '@/lib/billing/store';
import { planPrices, stripeApi, stripeConfigured } from '@/lib/billing/stripe';

export const runtime = 'nodejs';

// Owner only. Sends the browser to Stripe-hosted Checkout (subscription mode);
// Link is offered there when enabled in the Stripe dashboard. Rail never sees card data.
export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (flag: string) => NextResponse.redirect(`${origin}/app/settings?tab=billing&billing=${flag}`, 303);

  const { org, role } = await getCurrentOrg();
  if (role !== 'owner' || isDemoOrg(org.slug)) return back('forbidden');
  if (!stripeConfigured()) return back('unavailable');

  const plan = (await req.formData()).get('plan') === 'whole_bar' ? 'whole_bar' : 'close';
  const price = planPrices()[plan];
  if (!price) return back('unavailable');

  try {
    const existing = await getOrgBilling(org.id);
    // One subscription per org: a live one goes to the portal, not a second checkout.
    if (existing && ['active', 'trialing', 'past_due'].includes(existing.status)) return back('already');

    const user = await getAuthUser();
    const session = await stripeApi<{ url: string }>('POST', '/checkout/sessions', {
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      client_reference_id: org.id,
      metadata: { organization_id: org.id },
      subscription_data: { metadata: { organization_id: org.id } },
      ...(existing?.stripe_customer_id
        ? { customer: existing.stripe_customer_id }
        : { customer_email: user?.email ?? undefined }),
      success_url: `${origin}/app/settings?tab=billing&billing=success`,
      cancel_url: `${origin}/app/settings?tab=billing&billing=cancelled`,
    });
    return NextResponse.redirect(session.url, 303);
  } catch (e) {
    console.error('[billing/checkout]', e);
    return back('error');
  }
}
