-- ── Extend bar_messages for order-reply workflow ─────────────────────────────
ALTER TABLE bar_messages
  ADD COLUMN IF NOT EXISTS related_order_id UUID  REFERENCES rep_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_status   VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ai_breakdown     JSONB,
  ADD COLUMN IF NOT EXISTS gmail_message_id TEXT;  -- prevents duplicate ingest

-- Unique index on gmail_message_id so re-polling never double-inserts
CREATE UNIQUE INDEX IF NOT EXISTS ux_bar_msg_gmail_id
  ON bar_messages (gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_bar_msg_order
  ON bar_messages (related_order_id)
  WHERE related_order_id IS NOT NULL;
