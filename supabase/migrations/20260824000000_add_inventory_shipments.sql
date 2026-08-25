-- What a delivery actually cost, as opposed to what we assume it cost.
--
-- THE PROBLEM
--
-- The books value a delivery as quantity * inventory_items.cost_price — the
-- item's price TODAY. So a distributor's price rise is invisible until somebody
-- hand-edits the item, freight and bottle deposits have nowhere to live at all,
-- nothing reconciles against the paperwork, and — the part that is an outright
-- bug — editing an item's cost price silently restates every past month.
--
-- THE SHAPE
--
-- A shipment LINE is a usage_logs delivery row. That row already carries item,
-- quantity and date; all it lacks is the price and a link to the document. A
-- separate line-items table would mean two records of one event that can
-- disagree, and the stock movement and the money would drift apart.

CREATE TABLE IF NOT EXISTS inventory_shipments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Either a known rep, or just a name. A bar buys from vendors it has never
  -- created a rep record for, and forcing one first would stop the entry dead.
  rep_id          UUID        REFERENCES reps(id) ON DELETE SET NULL,
  vendor_name     TEXT        NOT NULL,

  invoice_number  TEXT,
  invoice_date    DATE        NOT NULL,
  received_date   DATE,

  freight         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (freight       >= 0),
  tax             NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax           >= 0),
  other_charges   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (other_charges >= 0),
  -- Recorded but NOT a cost of sale: deposits come back when the empties do.
  deposits        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deposits      >= 0),

  -- What the paper says. Stored to reconcile against, never used to compute.
  invoice_total   NUMERIC(12,2),

  notes           TEXT,
  -- Which shipments to re-check when the model or its prompt changes.
  source          TEXT        NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('ai_paste', 'manual')),

  -- Voiding reverses the stock without destroying the record. Cost prices are
  -- deliberately NOT rolled back: a later invoice may already have moved them.
  -- A posted document that can be deleted outright is how a P&L quietly
  -- changes with nothing to point at.
  voided_at       TIMESTAMPTZ,
  voided_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_shipments_org_date
  ON inventory_shipments(organization_id, invoice_date DESC);

ALTER TABLE inventory_shipments ENABLE ROW LEVEL SECURITY;

-- Postgres has no CREATE POLICY IF NOT EXISTS; dropping first keeps this
-- migration safe to run more than once.
DROP POLICY IF EXISTS "org_members_read_inventory_shipments"  ON inventory_shipments;
DROP POLICY IF EXISTS "org_members_write_inventory_shipments" ON inventory_shipments;

CREATE POLICY "org_members_read_inventory_shipments"
  ON inventory_shipments FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "org_members_write_inventory_shipments"
  ON inventory_shipments FOR ALL
  USING (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  );

-- ── The two columns a delivery row is missing ────────────────────────────────
--
-- Both NULLABLE, and that is the entire backward-compatibility story: every
-- delivery already recorded has unit_cost NULL and keeps the valuation it has
-- today. Nothing already reported moves.
--
-- usage_logs predates this repo's migration set and its DDL is not readable
-- from source here, so this touches nothing but the two new columns.
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS shipment_id UUID REFERENCES inventory_shipments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_cost   NUMERIC(12,4);

COMMENT ON COLUMN usage_logs.unit_cost IS
  'Dollars per stock unit actually paid on this movement. NULL means no invoice '
  'recorded it, and the books fall back to inventory_items.cost_price.';

-- SET NULL, not CASCADE: deleting a shipment record must never delete the stock
-- movements it caused. Voiding is the supported path.
CREATE INDEX IF NOT EXISTS idx_usage_logs_shipment
  ON usage_logs(shipment_id)
  WHERE shipment_id IS NOT NULL;
