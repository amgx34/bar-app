-- Items the POS sells but the bar does not stock.
--
-- 2Touch's item audit lists everything that rings up, which includes deals and
-- combos — "Bucket of 5 Domestic", "2-for-1 Well", "Happy Hour Pitcher". Those
-- are pricing constructs, not things sitting on a shelf, so syncing them
-- created phantom inventory items that can never be counted or reordered and
-- that quietly distort par levels and reorder suggestions.
--
-- Excluding by name rather than by id because the POS item id is not stable
-- across 2Touch reinstalls, and the ingest payload is keyed on name anyway
-- (see the UNIQUE (organization_id, name) constraint on inventory_items).

CREATE TABLE IF NOT EXISTS pos_excluded_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Stored as the POS reports it, so the operator recognises it in the list.
  item_name       TEXT        NOT NULL,
  -- Matching key: case- and whitespace-insensitive, because the same deal comes
  -- back as "2-For-1 Well" and "2-for-1 well" depending on who keyed it in.
  match_key       TEXT        NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, match_key)
);

-- The ingest path loads the whole list for one org on every sync, so this is
-- the index that matters.
CREATE INDEX IF NOT EXISTS idx_pos_excluded_org ON pos_excluded_items(organization_id);

ALTER TABLE pos_excluded_items ENABLE ROW LEVEL SECURITY;

-- Postgres has no CREATE POLICY IF NOT EXISTS, so a re-run aborts on the first
-- policy and leaves everything after it unapplied. Dropping first makes this
-- file safe to run repeatedly — which matters because a migration that fails
-- halfway is exactly the one you need to run again.
DROP POLICY IF EXISTS "org_members_read_pos_excluded"   ON pos_excluded_items;
DROP POLICY IF EXISTS "org_members_write_pos_excluded"  ON pos_excluded_items;
DROP POLICY IF EXISTS "org_members_delete_pos_excluded" ON pos_excluded_items;

CREATE POLICY "org_members_read_pos_excluded"
  ON pos_excluded_items FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_write_pos_excluded"
  ON pos_excluded_items FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_delete_pos_excluded"
  ON pos_excluded_items FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- Normalises a POS item name to its matching key. Kept in the database so the
-- ingest route and the settings UI cannot drift apart on what "the same item"
-- means — a mismatch there silently stops an exclusion from applying.
CREATE OR REPLACE FUNCTION pos_item_match_key(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  -- Collapse runs of whitespace, trim, lowercase.
  SELECT lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')));
$$;
