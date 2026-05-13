-- ── Liquor-specific fields on inventory items ────────────────────────────────
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS bottle_size_ml  INTEGER,         -- e.g. 750, 1000, 1750
  ADD COLUMN IF NOT EXISTS pour_size_oz    NUMERIC(4, 2);   -- e.g. 1.50, 2.00

-- Index for filtering bottle-tracked items
CREATE INDEX IF NOT EXISTS ix_inventory_bottle
  ON inventory_items (organization_id, bottle_size_ml)
  WHERE bottle_size_ml IS NOT NULL;

-- ── Additional organization fields ───────────────────────────────────────────
-- bar_settings JSONB already exists; new keys are added in application code.
-- These dedicated columns allow direct SQL queries/filtering if needed.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS bar_type  VARCHAR(30),   -- bar | nightclub | restaurant | brewery | hotel_bar | other
  ADD COLUMN IF NOT EXISTS bar_address TEXT,
  ADD COLUMN IF NOT EXISTS bar_phone VARCHAR(30);
