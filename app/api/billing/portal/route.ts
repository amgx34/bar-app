import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentOrg } from '@/lib/org';
import { getOrgBilling, isDemoOrg } from '@/lib/billing/store';
import { stripeApi, stripeConfigured } from '@/lib/billing/stripe';

export const runtime = 'nodejs';

// Owner only. Stripe's hosted portal handles plan change, card update and cancel.
export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (flag: string) => NextResponse.redirect(`${origin}/app/settings?tab=billing&billing=${flag}`, 303);

  const { org, role } = await getCurrentOrg();
  if (role !== 'owner' || isDemoOrg(org.slug)) return back('forbidden');
  if (!stripeConfigured()) return back('unavailable');

  try {
    const billing = await getOrgBilling(org.id);
    if (!billing?.stripe_customer_id) return back('unavailable');
    const session = await stripeApi<{ url: string }>('POST', '/billing_portal/sessions', {
      customer: billing.stripe_customer_id,
      return_url: `${origin}/app/settings?tab=billing`,
    });
    return NextResponse.redirect(session.url, 303);
  } catch (e) {
    console.error('[billing/portal]', e);
    return back('error');
  }
}
