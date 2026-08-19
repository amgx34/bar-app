-- Stock kept in bottles, sold in shots.
--
-- THE PROBLEM
--
-- A bar counts vodka in bottles and sells it in 1.5oz shots. The POS reports
-- "Well Vodka x 185", and depletion subtracted 185 BOTTLES — a 750ml bottle
-- holds about 17 shots, so the deduction was roughly seventeen times too large.
-- Any bar with real opening counts would have watched its inventory evaporate.
--
-- The pieces to fix it were already on inventory_items: bottle_size_ml and
-- pour_size_oz have existed since the schema was written. Nothing read them.
--
-- WHAT THIS ADDS
--
--   1. A pour size per CATEGORY, so "Spirits pour 1.5oz" is set once instead of
--      on each of several hundred synced items. Items keep their own override.
--   2. A unit on bundle components, so a recipe can say "0.5 oz of well vodka"
--      rather than only "5 of these".
--
-- Together those answer one question in one place: how much stock, measured the
-- way the bar counts it, does a single POS sale consume?
--
-- RESOLUTION ORDER  (see lib/pos/pour.ts)
--
--   item.pour_size_oz  ->  category.default_pour_oz  ->  bar_settings.default_pour_oz
--
-- An item with a pour size but no bottle size still deducts one unit per sale.
-- Both numbers are needed to express a fraction, and guessing a bottle size
-- would be inventing the denominator of everything downstream.

-- ── Pour size per category ───────────────────────────────────────────────────

ALTER TABLE inventory_categories
  ADD COLUMN IF NOT EXISTS default_pour_oz NUMERIC(6,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_categories_pour_positive'
  ) THEN
    ALTER TABLE inventory_categories
      ADD CONSTRAINT inventory_categories_pour_positive
      -- A gallon is 128oz; anything above that is a typo, and a typo here
      -- silently changes every deduction in the category.
      CHECK (default_pour_oz IS NULL OR (default_pour_oz > 0 AND default_pour_oz <= 128));
  END IF;
END $$;

COMMENT ON COLUMN inventory_categories.default_pour_oz IS
  'Default pour in fluid ounces for items in this category. Overridden by '
  'inventory_items.pour_size_oz. Null means fall back to bar_settings.default_pour_oz.';

-- Seeds the obvious ones so the feature does something the moment it is enabled.
-- Only where nothing is set, so an operator decision is never overwritten.
UPDATE inventory_categories
SET default_pour_oz = 1.5
WHERE default_pour_oz IS NULL
  AND cost_type = 'beverage_cogs'
  AND lower(name) IN ('spirits', 'liquor', 'well', 'whiskey', 'vodka', 'tequila', 'rum', 'gin');

UPDATE inventory_categories
SET default_pour_oz = 5
WHERE default_pour_oz IS NULL
  AND lower(name) LIKE '%wine%';

-- ── Units on bundle components ───────────────────────────────────────────────

-- 'each' keeps the existing meaning: "5 of these", as the bar stocks them.
-- 'oz'   is the new one: "0.5 fluid ounces", converted through bottle_size_ml.
--
-- Defaulting to 'each' is what makes this safe for bundles that already exist —
-- a bucket of five bottles keeps deducting five bottles.
ALTER TABLE pos_bundle_components
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'each';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pos_bundle_components_unit_check'
  ) THEN
    ALTER TABLE pos_bundle_components
      ADD CONSTRAINT pos_bundle_components_unit_check
      CHECK (unit IN ('each', 'oz'));
  END IF;
END $$;

COMMENT ON COLUMN pos_bundle_components.unit IS
  'each = whole stock units per sale. oz = fluid ounces, divided by the item''s '
  'bottle_size_ml to get stock units. See lib/pos/pour.ts.';

-- The uniqueness has to include the unit now.
--
-- It was UNIQUE (bundle_id, inventory_item_id), which was right when every
-- component meant the same thing. With units, "2 each of X" and "0.5 oz of X"
-- are two different lines of one recipe — unusual, but the old constraint would
-- reject them with a duplicate-key error that says nothing about units.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pos_bundle_components_bundle_id_inventory_item_id_key'
  ) THEN
    ALTER TABLE pos_bundle_components
      DROP CONSTRAINT pos_bundle_components_bundle_id_inventory_item_id_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pos_bundle_components_unique_line'
  ) THEN
    ALTER TABLE pos_bundle_components
      ADD CONSTRAINT pos_bundle_components_unique_line
      UNIQUE (bundle_id, inventory_item_id, unit);
  END IF;
END $$;
