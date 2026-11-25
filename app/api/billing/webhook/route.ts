import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { subscriptionToRow } from '@/lib/billing/access';
import { priceMap, stripeApi, verifyStripeSignature } from '@/lib/billing/stripe';

export const runtime = 'nodejs';

type Obj = Record<string, unknown> & { metadata?: Record<string, string>; subscription?: string; client_reference_id?: string };
const SUB_EVENTS = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('Billing not configured', { status: 503 });

  const raw = await req.text(); // raw body: the signature covers exact bytes
  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature'), secret)) {
    return new Response('Bad signature', { status: 400 });
  }

  const event = JSON.parse(raw) as { id: string; type: string; created: number; data: { object: Obj } };
  const db = createAdminClient();

  // Idempotency: the primary key rejects a replay. admin-scope-ok: stripe_events has no organization_id, it is a global event ledger.
  const { error: dup } = await db.from('stripe_events').insert({ event_id: event.id, type: event.type });
  if (dup) return NextResponse.json({ received: true, duplicate: dup.code === '23505' }, { status: dup.code === '23505' ? 200 : 500 });

  try {
    let sub = null as Obj | null;
    if (SUB_EVENTS.includes(event.type)) sub = event.data.object;
    else if (event.type === 'checkout.session.completed' && event.data.object.subscription) {
      sub = await stripeApi<Obj>('GET', `/subscriptions/${event.data.object.subscription}`);
      sub!.metadata = { ...sub!.metadata, organization_id: sub!.metadata?.organization_id ?? event.data.object.client_reference_id! };
    }
    if (sub) {
      const row = subscriptionToRow(sub, priceMap());
      if (row.organization_id) {
        const at = new Date(event.created * 1000).toISOString();
        const { data: cur } = await db.from('org_billing').select('last_event_at')
          .eq('organization_id', row.organization_id).maybeSingle();
        // Stripe does not order deliveries: never let an older event overwrite a newer one.
        if (!cur?.last_event_at || cur.last_event_at <= at) {
          // admin-scope-ok: upsert keyed on organization_id taken from the signed event's metadata.
          const { error } = await db.from('org_billing').upsert({ ...row, last_event_at: at, updated_at: new Date().toISOString() });
          if (error) throw error;
        }
      }
    }
  } catch (e) {
    console.error('[billing/webhook]', event.type, e);
    // Release the id so Stripe's retry is processed rather than skipped as a duplicate.
    await db.from('stripe_events').delete().eq('event_id', event.id); // admin-scope-ok: global ledger, no org column.
    return new Response('Processing failed', { status: 500 });
  }
  return NextResponse.json({ received: true });
}
