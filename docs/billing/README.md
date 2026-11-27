# Billing (Stripe Checkout + Link + customer portal)

Rail never touches card data. Sign-up is Stripe-hosted Checkout in subscription mode; changing or cancelling is the Stripe-hosted customer portal. Link appears in Checkout on its own once it is enabled in the Stripe dashboard.

## What is in the code

| Piece | File |
|---|---|
| Billing state table + processed-event ledger (RLS), NOT applied | `supabase/migrations/20261125000100_org_billing.sql` |
| Pure rules: status to what the org may do, Stripe subscription to stored row | `lib/billing/access.ts` (tested) |
| Stripe REST calls (no SDK), signature check | `lib/billing/stripe.ts` (signature tested) |
| Reads, never throws | `lib/billing/store.ts` |
| Start checkout (owner only) | `POST /api/billing/checkout` |
| Open portal (owner only) | `POST /api/billing/portal` |
| Webhook: verifies signature on the raw body, idempotent on event id, ignores older events | `POST /api/billing/webhook` |
| Settings, Billing tab | `app/(app)/app/settings/_components/billing-tab.tsx` |
| Public pricing page | `/pricing` (linked in the footer) |
| Paywall (off by default) | `app/(app)/app/layout.tsx` |

Rules: one subscription per org. Past due keeps working for 7 days after the period end (`GRACE_DAYS`), then blocks only when enforcement is on. Demo orgs are always exempt. A bar with `status = 'comped'` is always allowed.

## Safety defaults

- No `STRIPE_SECRET_KEY`: the Billing tab says billing is off, the checkout and portal routes redirect back with "not switched on", the webhook answers 503 without `STRIPE_WEBHOOK_SECRET`. The app behaves as before.
- Migration not applied: reads return "no row" and the app keeps working. Checkout still works but the webhook cannot save state until the migration is applied.
- `BILLING_ENFORCE` unset or not `true`: nobody is ever blocked.

## Env vars

`STRIPE_SECRET_KEY` (use `sk_test_...` until you go live), `STRIPE_WEBHOOK_SECRET` (`whsec_...`), `STRIPE_PRICE_CLOSE`, `STRIPE_PRICE_WHOLE_BAR` (`price_...`), optional `NEXT_PUBLIC_PRICE_LABEL_CLOSE` / `NEXT_PUBLIC_PRICE_LABEL_WHOLE_BAR` (text shown on `/pricing`, for example `$99`), `BILLING_ENFORCE` (`true` to block unpaid bars).

## Owner steps

1. **Create a Stripe account** at dashboard.stripe.com. UNVERIFIED (not read today; check Stripe's "Account activation" page): for a person with no company Stripe normally lets you register as an individual or sole proprietor, and asks for your legal name, date of birth, home address, the last four of your SSN (or full SSN or ITIN if asked), a US bank account for payouts, a business description, and a support email or phone. An EIN is optional for a sole proprietor. Stripe may ask for more later. Stay in test mode until step 8.
2. **Create two products** in test mode, each with one recurring monthly price: "Rail Close" and "Rail Whole bar". The $99 and $199 figures are hypotheses (`docs/go-to-market/pricing-and-packaging.md`). Copy each `price_...` id into `STRIPE_PRICE_CLOSE` and `STRIPE_PRICE_WHOLE_BAR`.
3. **Enable Link**: Settings, Payment methods, turn on Link. Checkout offers it automatically.
4. **Customer portal**: Settings, Billing, Customer portal, turn on cancel subscription and plan switching (add both prices as switchable products), save.
5. **Webhook**: Developers, Webhooks, add endpoint `https://<your-domain>/api/billing/webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`. For local testing: `stripe listen --forward-to localhost:3000/api/billing/webhook`.
6. **Set the env vars** on Vercel (and `.env.local`), then redeploy.
7. **Apply the migration** to the dev database, test a checkout with card `4242 4242 4242 4242`, confirm the Billing tab shows Active. Then apply it to live.
8. **Go live**: repeat steps 2 to 5 with live keys and a live webhook secret.
9. **Before turning enforcement on**: every existing bar without a subscription would be blocked. Give each bar you are not charging a free pass first: `insert into org_billing (organization_id, status) select id, 'comped' from organizations where slug not like 'demo-%' on conflict (organization_id) do nothing;` then set `BILLING_ENFORCE=true`. Bars that subscribe later are overwritten by the webhook.

## What was and was not exercised

Exercised: the pure access rules, subscription mapping, signature verification and form encoding (unit tests). Not exercised: any real Stripe call, a real checkout, the portal, a webhook delivery, the migration, the paywall in a browser. All of those need keys and a database change that were out of bounds.
