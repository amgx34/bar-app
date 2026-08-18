-- Fixes pos_apply_item_sales, which has never successfully run.
--
-- The function declared `RETURNS TABLE (inventory_item_id UUID, delta NUMERIC)`.
-- A RETURNS TABLE column is a PL/pgSQL variable in scope for the entire body, so
-- the ON CONFLICT target further down —
--
--   ON CONFLICT (organization_id, sale_date, inventory_item_id)
--
-- could refer to either that variable or the real column, and Postgres refused
-- the whole call with:
--
--   42702: column reference "inventory_item_id" is ambiguous
--
-- The ingest route catches an RPC failure, records it in `result.errors` and
-- carries on so one bad day cannot block the others. That is the right
-- behaviour, but it meant this failed on EVERY sync with no visible symptom:
-- pos_item_sales filled up normally while pos_stock_applications stayed empty
-- and no stock ever moved.
--
-- The OUT parameters are renamed rather than the column, because the column name
-- is correct and the OUT names are only ever read positionally — the ingest
-- route counts the returned rows and does not reference the fields.
--
-- Safe to run on an installation that never got the broken version: this is the
-- same definition 20260817000003 now carries, and CREATE OR REPLACE makes it a
-- no-op there.
--
-- AFTER RUNNING THIS: the next sync applies the whole lookback window at once,
-- because pos_stock_applications is empty and every day therefore reads as new.
-- Those sales did happen and were never deducted, so the catch-up is correct —
-- but it will look like a sudden drop. If a bar's current_stock is not
-- trustworthy right now, do a count first; the function clamps at zero rather
-- than going negative.

-- CREATE OR REPLACE cannot rename OUT parameters: Postgres treats the OUT row
-- type as part of the signature and refuses with
--
--   42P13: cannot change return type of existing function
--
-- so the old definition has to go first. Nothing depends on this function — no
-- view, trigger or policy references it, only the ingest route calls it over
-- RPC — so the drop is safe, and running both statements in one transaction
-- leaves no window where the function is missing.
DROP FUNCTION IF EXISTS pos_apply_item_sales(UUID, DATE, JSONB);

CREATE OR REPLACE FUNCTION pos_apply_item_sales(
  p_org        UUID,
  p_sale_date  DATE,
  p_components JSONB
)
-- OUT parameters are deliberately NOT named after the columns they describe.
-- A RETURNS TABLE column becomes a PL/pgSQL variable in scope for the whole
-- body, so naming one `inventory_item_id` made the ON CONFLICT target below
-- ambiguous (42702) and every call failed. The ingest route swallowed that into
-- result.errors, so depletion silently did nothing for days.
RETURNS TABLE (moved_item_id UUID, moved_delta NUMERIC)
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

    moved_item_id := rec.item_id;
    moved_delta   := v_delta;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Service role only. This function writes stock and bypasses RLS by design, so
-- it must never be reachable from a browser session.
REVOKE ALL ON FUNCTION pos_apply_item_sales(UUID, DATE, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION pos_apply_item_sales(UUID, DATE, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION pos_apply_item_sales(UUID, DATE, JSONB) TO service_role;
