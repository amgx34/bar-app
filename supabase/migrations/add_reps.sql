-- ── Reps (suppliers / sales reps) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reps (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(120) NOT NULL,
  company         VARCHAR(120),
  phone           VARCHAR(30),
  email           VARCHAR(254),
  notes           TEXT,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_reps_org ON reps (organization_id);

ALTER TABLE reps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can manage reps"
  ON reps FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM memberships WHERE user_id = auth.uid()
  ));

-- ── Rep orders (purchase order history) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS rep_orders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rep_id          UUID        NOT NULL REFERENCES reps(id) ON DELETE RESTRICT,
  po_number       VARCHAR(64),
  delivery_date   DATE,
  notes           TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('draft','sent','confirmed','delivered','cancelled')),
  send_email      BOOLEAN     NOT NULL DEFAULT true,
  send_sms        BOOLEAN     NOT NULL DEFAULT false,
  -- Each element: {inventory_item_id?, name, quantity, unit, note?}
  items           JSONB       NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_rep_orders_org   ON rep_orders (organization_id);
CREATE INDEX IF NOT EXISTS ix_rep_orders_rep   ON rep_orders (rep_id, created_at DESC);

ALTER TABLE rep_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can manage rep orders"
  ON rep_orders FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM memberships WHERE user_id = auth.uid()
  ));

-- ── Link inventory items to reps ──────────────────────────────────────────────
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS rep_id UUID REFERENCES reps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_inventory_rep ON inventory_items (rep_id)
  WHERE rep_id IS NOT NULL;
