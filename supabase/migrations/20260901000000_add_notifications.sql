-- ── Notifications ────────────────────────────────────────────────────────────
-- System-generated alerts (low stock, nightly sales, payroll approval) that are
-- both an in-app inbox row and a Web Push message.
--
-- Deliberately NOT folded into bar_messages. That table is a rep correspondence
-- inbox — sender_email, requested_amount, ai_breakdown, gmail_message_id — and
-- every one of those columns would be NULL for a system alert. Two streams, one
-- bell.

-- ── notifications ────────────────────────────────────────────────────────────
-- Fanned out per recipient at write time rather than stored once per org, so
-- read state is per-person and the RLS policy is a plain user_id check.
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,

  event_type      TEXT        NOT NULL,
                  -- 'inventory.low_stock' | 'sales.z_report_closed'
                  -- 'sales.anomaly'       | 'payroll.approval_needed'
                  -- 'payroll.approved'    | 'payroll.changes_requested'
  title           TEXT        NOT NULL,
  body            TEXT        NOT NULL,
  link            TEXT,                    -- in-app deep link, e.g. /app/inventory
  payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Idempotency. The daily cron is re-runnable and Vercel retries failed
  -- invocations; without this a manual re-run would double-notify every owner.
  -- Scoped per recipient because the same event fans out to several users.
  dedupe_key      TEXT        NOT NULL,

  is_read         BOOLEAN     NOT NULL DEFAULT false,
  read_at         TIMESTAMPTZ,
  -- NULL until Web Push has been attempted; lets a future retry pass find
  -- rows that were created but never pushed.
  pushed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_dedupe
  ON notifications (user_id, dedupe_key);

CREATE INDEX IF NOT EXISTS ix_notifications_user_created
  ON notifications (user_id, organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_notifications_unread
  ON notifications (user_id, organization_id)
  WHERE is_read = false;

-- Lets the low-stock edge check find the previous digest without a sort over
-- the whole table.
CREATE INDEX IF NOT EXISTS ix_notifications_org_event
  ON notifications (organization_id, event_type, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "users delete own notifications"
  ON notifications FOR DELETE
  USING (user_id = auth.uid());
-- No INSERT policy: only the service role writes these.


-- ── push_subscriptions ───────────────────────────────────────────────────────
-- One row per browser install. A manager's phone and their laptop are separate
-- endpoints and both should buzz.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  endpoint        TEXT        NOT NULL,
  p256dh          TEXT        NOT NULL,
  auth            TEXT        NOT NULL,
  user_agent      TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The endpoint IS the device identity as far as the push service is concerned.
-- Re-subscribing on the same browser must update, not accumulate.
CREATE UNIQUE INDEX IF NOT EXISTS ux_push_sub_endpoint
  ON push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS ix_push_sub_user
  ON push_subscriptions (user_id, organization_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ── notification_preferences ─────────────────────────────────────────────────
-- Absence of a row means "use the role default". That is what makes a newly
-- added event type behave sensibly for existing users with no backfill, and it
-- keeps the table small — only explicit opt-outs are stored.
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id         UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,
  muted           BOOLEAN     NOT NULL DEFAULT true,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id, event_type)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own notification preferences"
  ON notification_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
