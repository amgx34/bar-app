-- Billing state for an organization, written only by the Stripe webhook (service role).
-- NOT applied anywhere. The app tolerates this table being absent.
-- One subscription per organization: organization_id is the primary key.
CREATE TABLE IF NOT EXISTS org_billing (
  organization_id        UUID        PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  -- Stripe's subscription status, or 'comped' (set by hand) for a bar that never pays.
  status                 TEXT        NOT NULL DEFAULT 'none',
  plan                   TEXT,       -- 'close' | 'whole_bar'
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN     NOT NULL DEFAULT false,
  -- Stripe event.created of the last event applied; an older event never overwrites a newer one.
  last_event_at          TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_org_billing_customer
  ON org_billing (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_org_billing_subscription
  ON org_billing (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE org_billing ENABLE ROW LEVEL SECURITY;

-- Members may read their own bar's billing state. No insert/update/delete policy:
-- only the service role (the webhook) writes.
DROP POLICY IF EXISTS org_billing_member_read ON org_billing;
CREATE POLICY org_billing_member_read ON org_billing FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
);

-- Processed Stripe event ids. The primary key is the idempotency guard.
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id    TEXT        PRIMARY KEY,
  type        TEXT        NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY; -- no policies: service role only
