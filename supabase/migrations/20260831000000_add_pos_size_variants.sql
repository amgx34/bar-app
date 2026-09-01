-- POS size variants — SGL, DBL, RSGL, RDB.
--
-- 2Touch rings a double as its own item: tblItem.szDescription arrives as
-- "DBL TITO'S", which keys to itself, matches no inventory item, costs nothing,
-- deducts nothing, and gets auto-created as a phantom inventory row next to the
-- real "Tito's". Meanwhile the bar poured two ounces.
--
-- This migration stores the parse alongside the POS line rather than instead of
-- it. The variant row survives exactly as it rang up — revenue stays attributed
-- to the thing the POS sold, and the per-size split stays reportable — while
-- base_match_key gives the sales report and depletion an item that inventory
-- actually knows about.
--
-- R IS RED BULL, NOT ROCKS. RSGL and RDB are a single and a double served with
-- Red Bull, so they carry the SAME pour multiplier as SGL and DBL. The Red Bull
-- is a second inventory item on the line, which is what pos_bundles already
-- models; nothing here deducts it.

-- ── Per-org token configuration ──────────────────────────────────────────────

-- Optional. An org with no rows here falls back to the four defaults in
-- lib/pos/variants.ts (DEFAULT_SIZE_TOKENS) — not to "no parsing at all",
-- because the tokens are near-universal on 2Touch and requiring setup would
-- leave every existing bar mis-costing doubles until someone noticed.
--
-- Configuring ANY row replaces the defaults for that org rather than extending
-- them, so a bar's table means exactly what it says.
CREATE TABLE IF NOT EXISTS pos_size_tokens (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Normalised lower-case, matched as a whole word at the start or end of a
  -- POS item name. Stored lower-case so the app never has to fold it again.
  token           TEXT        NOT NULL CHECK (token = lower(btrim(token)) AND token <> ''),
  -- Multiplier on the item's configured pour size. A DBL pours twice what the
  -- pour size says, so it costs and deducts twice as much.
  --
  -- Must be positive: a zero multiplier costs nothing to pour, which would read
  -- as pure profit on every drink carrying the token.
  multiplier      NUMERIC(8,4) NOT NULL CHECK (multiplier > 0),
  label           TEXT        NOT NULL DEFAULT '',
  -- What else the token implies is in the glass, for display only. Nothing
  -- deducts this — see the note above.
  mixer           TEXT,
  sort_order      SMALLINT    NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, token)
);

CREATE INDEX IF NOT EXISTS idx_pos_size_tokens_org
  ON pos_size_tokens(organization_id, sort_order);

-- ── The parse, stored on the sales fact ──────────────────────────────────────

-- match_key stays the VARIANT key, so UNIQUE (organization_id, sale_date,
-- match_key) keeps a day's singles and doubles as separate rows. Collapsing
-- them on write would destroy the per-size split permanently.
ALTER TABLE pos_item_sales
  ADD COLUMN IF NOT EXISTS base_match_key TEXT,
  ADD COLUMN IF NOT EXISTS size_token     TEXT;

-- Always populated, equal to match_key when the name carries no token, so a
-- read can GROUP BY base_match_key unconditionally without a COALESCE that
-- someone will eventually forget.
UPDATE pos_item_sales
   SET base_match_key = match_key
 WHERE base_match_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_pos_item_sales_org_base
  ON pos_item_sales(organization_id, base_match_key);

-- ── Backfill of history ──────────────────────────────────────────────────────

-- One-shot. This deliberately mirrors DEFAULT_SIZE_TOKENS in
-- lib/pos/variants.ts for the four built-in tokens only; going forward the
-- application is the sole authority on parsing, and per-org custom tokens are
-- never applied retroactively here.
--
-- Sales history only. current_stock is NOT restated: those deductions already
-- happened against physical counts the operator has since reconciled, and
-- rewriting the stock ledger from a name parse would silently contradict them.
-- pos_stock_applications is likewise left alone, so no day is re-deducted.
WITH parsed AS (
  SELECT s.id,
         t.token,
         -- Whole word at the start or the end of the name, never inside it:
         -- matching "dbl" within "Old Dbl Barrel Bourbon" would silently drop a
         -- word and merge the item into whatever the remainder keys to.
         btrim(
           CASE
             WHEN s.match_key ~ ('^' || t.token || '\s') THEN regexp_replace(s.match_key, '^' || t.token || '\s+', '')
             ELSE regexp_replace(s.match_key, '\s+' || t.token || '$', '')
           END
         ) AS base
    FROM pos_item_sales s
    JOIN (VALUES ('sgl'), ('dbl'), ('rsgl'), ('rdb')) AS t(token)
      ON s.match_key ~ ('^' || t.token || '\s') OR s.match_key ~ ('\s' || t.token || '$')
   WHERE s.size_token IS NULL
)
UPDATE pos_item_sales s
   SET base_match_key = p.base,
       size_token     = p.token
  FROM parsed p
 WHERE s.id = p.id
   -- A name that is nothing but a token leaves an empty base, and every such
   -- line across unrelated items would collapse onto one key.
   AND p.base <> '';

-- ── Row level security ───────────────────────────────────────────────────────

ALTER TABLE pos_size_tokens ENABLE ROW LEVEL SECURITY;

-- Postgres has no CREATE POLICY IF NOT EXISTS, so a re-run would abort here and
-- leave the rest unapplied. Drop first, as the bundles migration does.
DROP POLICY IF EXISTS "org_members_all_pos_size_tokens" ON pos_size_tokens;

-- Members read and write their own org's tokens. ALL rather than separate
-- policies because a token is edited in place when a bar corrects a multiplier.
CREATE POLICY "org_members_all_pos_size_tokens"
  ON pos_size_tokens FOR ALL
  USING (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  );
