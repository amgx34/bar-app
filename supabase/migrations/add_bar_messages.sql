-- ── Bar inbound messages / rep requests ──────────────────────────────────────
-- Received via the public /contact/[slug] form or in-app compose.
-- Bars can see & mark messages as read in the notification bell.
CREATE TABLE IF NOT EXISTS bar_messages (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Who sent it
  sender_name      VARCHAR(120) NOT NULL,
  sender_email     VARCHAR(254),
  sender_company   VARCHAR(120),

  -- Message content
  message_type     VARCHAR(50)  NOT NULL DEFAULT 'general',
                   -- 'general' | 'order_request' | 'inquiry'
  subject          VARCHAR(200) NOT NULL,
  body             TEXT,

  -- Order-request specific fields (all optional)
  request_type     VARCHAR(100),   -- e.g. "Order Request", "Pricing Inquiry"
  item_category    VARCHAR(100),   -- e.g. "Spirits", "Beer"
  item_details     TEXT,
  quantity         VARCHAR(100),
  requested_amount DECIMAL(10, 2), -- prominently displayed in notification

  -- Read state
  is_read          BOOLEAN      NOT NULL DEFAULT false,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_bar_msg_org_read
  ON bar_messages (organization_id, is_read, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE bar_messages ENABLE ROW LEVEL SECURITY;

-- Public contact form: anyone may INSERT (rep sends request to a bar)
CREATE POLICY "public can insert bar messages"
  ON bar_messages FOR INSERT
  WITH CHECK (true);

-- Only org members can read their bar's messages
CREATE POLICY "org members can read bar messages"
  ON bar_messages FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM memberships WHERE user_id = auth.uid()
  ));

-- Org members can mark messages as read
CREATE POLICY "org members can update bar messages"
  ON bar_messages FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM memberships WHERE user_id = auth.uid()
  ));

-- Org members can delete messages
CREATE POLICY "org members can delete bar messages"
  ON bar_messages FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM memberships WHERE user_id = auth.uid()
  ));
