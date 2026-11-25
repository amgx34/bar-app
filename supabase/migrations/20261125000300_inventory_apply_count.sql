-- One transaction for a whole count session: every stock update and its
-- usage_logs 'recount' row land together or not at all. NOT YET APPLIED.
-- The app works without it (it falls back to per-row writes with rollback),
-- but only this function makes the batch truly atomic.
--
-- p_rows: [{"item_id": "<uuid>", "new_stock": <number>, "quantity": <number>, "note": "<text>"}]
-- Every row is checked against p_org inside the function; a foreign id aborts all.
CREATE OR REPLACE FUNCTION inventory_apply_count(p_org UUID, p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec RECORD;
  n   INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT (e->>'item_id')::uuid AS item_id,
           (e->>'new_stock')::numeric AS new_stock,
           (e->>'quantity')::numeric AS quantity,
           e->>'note' AS note
    FROM jsonb_array_elements(p_rows) e
  LOOP
    IF rec.new_stock < 0 THEN
      RAISE EXCEPTION 'negative count for %', rec.item_id;
    END IF;
    UPDATE inventory_items SET current_stock = rec.new_stock
     WHERE id = rec.item_id AND organization_id = p_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'item % not in organization', rec.item_id;
    END IF;
    INSERT INTO usage_logs (organization_id, item_id, quantity, reason, note)
    VALUES (p_org, rec.item_id, rec.quantity, 'recount'::usage_reason, rec.note);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION inventory_apply_count(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION inventory_apply_count(UUID, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION inventory_apply_count(UUID, JSONB) TO service_role;
