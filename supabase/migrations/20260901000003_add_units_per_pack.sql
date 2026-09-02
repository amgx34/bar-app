-- ── Pack size for packaged goods ─────────────────────────────────────────────
-- A bar buys canned beer and seltzer by the case and counts it as "2 cases and
-- 9 loose", but sells it one can at a time. There was nowhere to record the
-- relationship, so the demo seed encoded it in the item NAME — "Modelo Especial
-- (case/24)" — which is also a name no POS line will ever match.
--
-- For LIQUID this problem is already solved: bottle_size_ml + pour_size_oz
-- express "one stock unit is N servings" as a volume ratio, and lib/pos/pour.ts
-- does the arithmetic. That vocabulary is wrong for discrete goods. A 24-pack
-- is not 24 pours of a case, it is 24 things, and forcing it through millilitres
-- would mean inventing a container volume that describePour() would then narrate
-- back to the operator as fact.
--
-- NULL means "counted as itself" — a keg, a spirit bottle, a single can. That is
-- every existing row, so nothing needs backfilling and no item changes behaviour.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS units_per_pack INTEGER
    CHECK (units_per_pack IS NULL OR units_per_pack > 1);

COMMENT ON COLUMN inventory_items.units_per_pack IS
  'DATA ENTRY ONLY. How many sellable singles are in one purchase pack, so the '
  'receiving and counting screens can accept "5 cases" or "2 cases + 9 loose". '
  'current_stock, cost_price, par_level and usage_logs.quantity are ALWAYS in '
  'singles — this column must never be read by depletion, COGS, par comparison '
  'or velocity. pos_apply_item_sales() subtracts what the POS rang, 1:1, and '
  'putting a second conversion in that path is the bug this design exists to '
  'avoid. A pack of 1 is not a pack, hence the > 1 constraint.';
