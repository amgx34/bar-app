-- Deals as recipes, and POS sales as stock depletion.
--
-- Two related changes:
--
--   1. A deal ("Bucket of 5 Domestic") stops being a phantom inventory item and
--      becomes a recipe that resolves to the things it is actually made of.
--   2. Item-audit quantities, which the ingest route has been discarding since
--      it was written, start moving stock.
--
-- THE IDEMPOTENCY PROBLEM
--
-- The agent re-sends a rolling lookback window (Sync.LookbackDays, default 2)
-- every Sync.IntervalMinutes (default 5). The same sale day therefore arrives
-- hundreds of times. Every other table the ingest touches is an UPSERT, which is
-- naturally idempotent — but "subtract 60 units" is not. Applied naively, a
-- single bucket of beer would drain a bar's entire stock inside an hour.
--
-- So depletion is never expressed as a subtraction of what the POS reported. It
-- is expressed as a subtraction of the DELTA between what the POS now reports
-- for a given (day, item) and what we have already applied for that pair.
-- pos_stock_applications is that memory. Re-sending an unchanged day yields a
-- delta of zero and touches nothing.
--
-- That also makes revisions work for free: if the POS restates a day downward,
-- the delta is negative and the stock comes back.

-- ── Bundle definitions ───────────────────────────────────────────────────────

-- Matched on the same normalised key as pos_excluded_items, for the same reason:
-- the POS returns "2-For-1 Well" and "2-for-1 well" depending on who keyed it in.
CREATE TABLE IF NOT EXISTS pos_bundles (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- As the POS reports it, so the operator recognises it in the list.
  item_name       TEXT        NOT NULL,
  match_key       TEXT        NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, match_key)
);

CREATE INDEX IF NOT EXISTS idx_pos_bundles_org ON pos_bundles(organization_id);

-- What one sale of the bundle consumes. Quantity is NUMERIC, not INTEGER: a
-- "Pitcher" is a real fractional draw on a keg, and a half-pour is a legitimate
-- component of a combo.
CREATE TABLE IF NOT EXISTS pos_bundle_components (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id         UUID        NOT NULL REFERENCES pos_bundles(id) ON DELETE CASCADE,
  inventory_item_id UUID        NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity          NUMERIC(12,4) NOT NULL CHECK (quantity > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bundle_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_bundle_components_bundle
  ON pos_bundle_components(bundle_id);

-- ── Raw POS sales facts ──────────────────────────────────────────────────────

-- One row per (day, POS line item). This is what the POS said, before any
-- bundle expansion — kept separately from the depletion ledger so that changing
-- a recipe never rewrites history, and so revenue stays attributed to the thing
-- that actually rang up rather than to its components.
CREATE TABLE IF NOT EXISTS pos_item_sales (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sale_date       DATE        NOT NULL,
  item_name       TEXT        NOT NULL,
  match_key       TEXT        NOT NULL,
  category_name   TEXT,
  qty_sold        NUMERIC(14,4) NOT NULL DEFAULT 0,
  net_sales       NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- True when this line resolved to a bundle recipe rather than to stock.
  is_bundle       BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, sale_date, match_key)
);

CREATE INDEX IF NOT EXISTS idx_pos_item_sales_org_date
  ON pos_item_sales(organization_id, sale_date DESC);

-- ── Depletion ledger ─────────────────────────────────────────────────────────

-- How much of each inventory item we have ALREADY deducted for a given business
-- day. Not a report — this exists solely so a repeated sync is a no-op. Deleting
-- a row here would cause that day to be deducted a second time.
CREATE TABLE IF NOT EXISTS pos_stock_applications (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sale_date         DATE        NOT NULL,
  inventory_item_id UUID        NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  applied_qty       NUMERIC(14,4) NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, sale_date, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_stock_applications_org_date
  ON pos_stock_applications(organization_id, sale_date DESC);

-- ── Row level security ───────────────────────────────────────────────────────

ALTER TABLE pos_bundles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_bundle_components  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_item_sales         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_stock_applications ENABLE ROW LEVEL SECURITY;

-- Postgres has no CREATE POLICY IF NOT EXISTS, so a re-run would abort on the
-- first one and leave the rest of this file unapplied. Dropping first keeps the
-- migration safe to run more than once.
DROP POLICY IF EXISTS "org_members_all_pos_bundles"             ON pos_bundles;
DROP POLICY IF EXISTS "org_members_all_pos_bundle_components"   ON pos_bundle_components;
DROP POLICY IF EXISTS "org_members_read_pos_item_sales"         ON pos_item_sales;
DROP POLICY IF EXISTS "org_members_read_pos_stock_applications" ON pos_stock_applications;

-- Members read and write their own org's bundles. Written as one ALL policy per
-- table rather than the three separate policies pos_excluded_items uses, because
-- bundles are edited in place (a recipe changes) and not just added and removed.
CREATE POLICY "org_members_all_pos_bundles"
  ON pos_bundles FOR ALL
  USING (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  );

-- Components inherit tenancy through their bundle — they carry no
-- organization_id of their own, the same shape as weigh_report_items.
CREATE POLICY "org_members_all_pos_bundle_components"
  ON pos_bundle_components FOR ALL
  USING (
    bundle_id IN (
      SELECT b.id FROM pos_bundles b
      WHERE b.organization_id IN (
        SELECT organization_id FROM memberships WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    bundle_id IN (
      SELECT b.id FROM pos_bundles b
      WHERE b.organization_id IN (
        SELECT organization_id FROM memberships WHERE user_id = auth.uid()
      )
    )
  );

-- Sales and the depletion ledger are written only by the ingest route (service
-- role, which bypasses RLS). Members get read access so the UI can show them;
-- nothing in the app should ever write these by hand.
CREATE POLICY "org_members_read_pos_item_sales"
  ON pos_item_sales FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "org_members_read_pos_stock_applications"
  ON pos_stock_applications FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  );

-- ── usage_logs vocabulary ────────────────────────────────────────────────────

-- usage_logs.reason is a Postgres ENUM (`usage_reason`), not TEXT with a CHECK
-- constraint. usage_logs predates this repo's migrations so there is no DDL here
-- to read that from — an earlier version of this file assumed a CHECK constraint
-- and failed with "invalid input value for enum usage_reason".
--
-- Two new values:
--   pos_sale      stock consumed by a POS sale
--   pos_reversal  the correction when the POS later restates a day downward
--
-- Deliberately NOT added to `stockAdjustmentSchema` in lib/schemas/inventory.ts:
-- these are written only by pos_apply_item_sales below. A person filing a manual
-- adjustment must not be able to label it as a POS sale, or the one movement
-- type that is supposed to be machine-generated stops being trustworthy.
--
-- ADD VALUE is additive and takes no table lock — existing rows are untouched
-- and every other value keeps working. IF NOT EXISTS makes it re-runnable.
--
-- NOTE: an enum value cannot be USED in the same transaction that adds it.
-- Nothing here does — the function below only stores 'pos_sale' as text in its
-- body, which plpgsql resolves at call time, not at CREATE time. But if your
-- client reports "unsafe use of new value", run these two lines on their own
-- first, then the rest of the file.
ALTER TYPE usage_reason ADD VALUE IF NOT EXISTS 'pos_sale';
ALTER TYPE usage_reason ADD VALUE IF NOT EXISTS 'pos_reversal';

-- ── Depletion, applied atomically ────────────────────────────────────────────

-- Applies one business day's resolved component quantities.
--
-- p_components is [{"item_id": "<uuid>", "qty": <number>}, ...] — already
-- resolved by the caller, meaning bundles have been expanded into their
-- components and quantities for the same item summed.
--
-- Returns the rows it actually moved, so the ingest route can report a count
-- without a second round trip.
--
-- One function rather than a loop of statements from the route: a half-applied
-- day would leave the ledger disagreeing with the stock it is supposed to
-- describe, and there would be no way to tell which rows had landed.
CREATE OR REPLACE FUNCTION pos_apply_item_sales(
  p_org        UUID,
  p_sale_date  DATE,
  p_components JSONB
)
RETURNS TABLE (inventory_item_id UUID, delta NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec        RECORD;
  v_applied  NUMERIC;
  v_delta    NUMERIC;
BEGIN
  FOR rec IN
    SELECT (e->>'item_id')::UUID  AS item_id,
           (e->>'qty')::NUMERIC   AS qty
    FROM jsonb_array_elements(COALESCE(p_components, '[]'::JSONB)) e
  LOOP
    -- FOR UPDATE so two overlapping syncs cannot both read the same prior
    -- applied figure and each subtract the full amount.
    SELECT a.applied_qty INTO v_applied
    FROM pos_stock_applications a
    WHERE a.organization_id   = p_org
      AND a.sale_date         = p_sale_date
      AND a.inventory_item_id = rec.item_id
    FOR UPDATE;

    v_delta := rec.qty - COALESCE(v_applied, 0);
    CONTINUE WHEN v_delta = 0;

    -- Clamped at zero: negative stock is rejected everywhere else in the app,
    -- and a bar whose opening count was never entered would otherwise drift
    -- deeply negative on its first sync. The usage log below still records the
    -- true delta, so consumption analytics stays accurate even when the clamp
    -- bites — the two can legitimately disagree until the next recount.
    UPDATE inventory_items
    SET current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_delta)
    WHERE id = rec.item_id
      AND organization_id = p_org;

    -- Item belongs to another org, or no longer exists. Skip it rather than
    -- recording an application we did not make.
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- The cast is required, not decorative. `reason` is the enum usage_reason,
    -- and a CASE whose branches are both unknown literals resolves to TEXT —
    -- which Postgres will not implicitly coerce to an enum. Without ::usage_reason
    -- every depletion fails at runtime with "column reason is of type
    -- usage_reason but expression is of type text".
    INSERT INTO usage_logs (organization_id, item_id, quantity, reason, note)
    VALUES (
      p_org,
      rec.item_id,
      ABS(v_delta),
      (CASE WHEN v_delta > 0 THEN 'pos_sale' ELSE 'pos_reversal' END)::usage_reason,
      'POS sales for ' || TO_CHAR(p_sale_date, 'YYYY-MM-DD')
    );

    INSERT INTO pos_stock_applications
      (organization_id, sale_date, inventory_item_id, applied_qty)
    VALUES
      (p_org, p_sale_date, rec.item_id, rec.qty)
    ON CONFLICT (organization_id, sale_date, inventory_item_id)
    DO UPDATE SET applied_qty = EXCLUDED.applied_qty, updated_at = NOW();

    inventory_item_id := rec.item_id;
    delta             := v_delta;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Service role only. This function writes stock and bypasses RLS by design, so
-- it must never be reachable from a browser session.
REVOKE ALL ON FUNCTION pos_apply_item_sales(UUID, DATE, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION pos_apply_item_sales(UUID, DATE, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION pos_apply_item_sales(UUID, DATE, JSONB) TO service_role;
