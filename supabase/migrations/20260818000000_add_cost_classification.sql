-- Telling cost of goods apart from the cost of running the place.
--
-- THE PROBLEM
--
-- The books computed COGS as every usage_log multiplied by its cost price, with
-- no distinction between what went into a drink and what went into a bin. A bar
-- that stocks napkins, straws and cups in Rail — which the default category list
-- actively encourages, since it ships a "Supplies" category — has been counting
-- them as cost of goods.
--
-- That is not a rounding error. Pour cost is the number a bar is judged on and
-- benchmarks against (roughly 18-24% for beverage). Mixing paper goods into it
-- inflates the percentage, makes it incomparable to any industry figure, and
-- hides whether the actual pouring is under control.
--
-- And costs that never touch inventory at all — a DJ, a repair, a licence — had
-- nowhere to live, so they were simply absent from the P&L.
--
-- THE SHAPE
--
--   Net revenue
--     − beverage COGS      -> pour cost %
--     − food COGS          -> food cost %
--   = gross profit
--     − operating supplies (napkins, straws, cups)
--     − labour
--     − operating expenses (DJ, R&M, licences)
--   = net operating
--
-- Supplies sit BELOW gross profit deliberately. They are a real cost and must be
-- subtracted, but putting them above it would corrupt the one ratio the whole
-- category split exists to protect.

-- ── Classifying inventory categories ─────────────────────────────────────────

-- Applied at the CATEGORY level, not per item: a bar has a handful of categories
-- and hundreds of items, and asking someone to classify each bottle is how a
-- feature goes unused. Items inherit from their category.
ALTER TABLE inventory_categories
  ADD COLUMN IF NOT EXISTS cost_type TEXT NOT NULL DEFAULT 'beverage_cogs';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_categories_cost_type_check'
  ) THEN
    ALTER TABLE inventory_categories
      ADD CONSTRAINT inventory_categories_cost_type_check
      CHECK (cost_type IN ('beverage_cogs', 'food_cogs', 'supplies', 'excluded'));
  END IF;
END $$;

COMMENT ON COLUMN inventory_categories.cost_type IS
  'beverage_cogs = counts toward pour cost; food_cogs = counts toward food cost; '
  'supplies = operating supplies below gross profit; excluded = not a cost of sale.';

-- Reclassify the categories the setup wizard seeds. Only where the operator has
-- not already chosen something, so re-running never overrides a decision.
UPDATE inventory_categories
SET cost_type = 'supplies'
WHERE cost_type = 'beverage_cogs'
  AND lower(name) IN ('supplies', 'bar supplies', 'paper goods', 'disposables');

UPDATE inventory_categories
SET cost_type = 'food_cogs'
WHERE cost_type = 'beverage_cogs'
  AND lower(name) IN ('garnishes & food', 'garnishes and food', 'food', 'kitchen');

-- ── Costs that never touch inventory ─────────────────────────────────────────

-- A DJ, a plumber, a music licence. These are real money leaving the business
-- that no stock movement will ever describe.
CREATE TABLE IF NOT EXISTS operating_expenses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  description     TEXT        NOT NULL,
  -- Free-ish grouping so a bar can use its own language, constrained to a set
  -- that maps onto how hospitality P&Ls are actually read.
  category        TEXT        NOT NULL DEFAULT 'other'
                  CHECK (category IN (
                    'entertainment',  -- DJ, band, karaoke host
                    'maintenance',    -- repairs, servicing, pest control
                    'utilities',      -- power, water, internet
                    'licensing',      -- liquor licence, music licensing, POS fees
                    'marketing',
                    'cleaning',
                    'professional',   -- accountant, legal
                    'other'
                  )),

  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  expense_date    DATE        NOT NULL,

  -- Monthly costs are entered once and counted in every period they cover,
  -- rather than forcing somebody to re-key the rent twelve times a year.
  is_recurring    BOOLEAN     NOT NULL DEFAULT FALSE,
  -- When recurring, the last month it applies to. NULL means ongoing.
  recurring_until DATE,

  notes           TEXT,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A recurrence that ends before it starts would silently never apply.
  CONSTRAINT operating_expenses_recurrence_order CHECK (
    recurring_until IS NULL OR recurring_until >= expense_date
  )
);

CREATE INDEX IF NOT EXISTS idx_operating_expenses_org_date
  ON operating_expenses(organization_id, expense_date DESC);

ALTER TABLE operating_expenses ENABLE ROW LEVEL SECURITY;

-- Postgres has no CREATE POLICY IF NOT EXISTS; dropping first keeps this
-- migration safe to run more than once.
DROP POLICY IF EXISTS "org_members_read_operating_expenses"  ON operating_expenses;
DROP POLICY IF EXISTS "org_members_write_operating_expenses" ON operating_expenses;

CREATE POLICY "org_members_read_operating_expenses"
  ON operating_expenses FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "org_members_write_operating_expenses"
  ON operating_expenses FOR ALL
  USING (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  );
