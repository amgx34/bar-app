-- ═══════════════════════════════════════════════════════════════════════════
-- inventory_items: add the UNIQUE (organization_id, name) constraint that
-- POST /api/2touch/ingest has always assumed.
--
-- Without it, the route's
--     .upsert(..., { onConflict: 'organization_id,name' })
-- fails with 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
-- specification") on EVERY row, so no 2Touch item has ever reached inventory.
-- The failure was silent because the route discarded the error and counted the
-- row as written anyway.
--
-- inventory_categories already has the equivalent constraint, which is why
-- categories imported fine while items did not.
--
-- Verified safe before writing this: 446 existing rows, 0 duplicate
-- (organization_id, name) pairs. If that changes, dedupe first — the query at
-- the bottom finds offenders.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'inventory_items'::regclass
      AND conname  = 'inventory_items_org_name_key'
  ) THEN
    ALTER TABLE inventory_items
      ADD CONSTRAINT inventory_items_org_name_key UNIQUE (organization_id, name);
  END IF;
END $$;

-- Run first if the ALTER above reports a uniqueness violation:
--
--   SELECT organization_id, name, COUNT(*)
--   FROM inventory_items
--   GROUP BY organization_id, name
--   HAVING COUNT(*) > 1;
