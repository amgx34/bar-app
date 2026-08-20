-- Can inventory hold FRACTIONAL stock?
--
-- Read-only. Nothing here writes anything.
--
-- WHY THIS MATTERS
--
-- Depletion already converts a POS sale into a FRACTION of a stock unit: 17
-- shots of a 750ml bottle at a 1.5oz pour take about 1.0 bottle off the shelf,
-- not 17. That arithmetic lives in lib/pos/pour.ts and runs in the ingest route
-- before anything reaches the database.
--
-- It only survives the round trip if the columns can store a fraction. If
-- inventory_items.current_stock is an integer type, every fractional deduction
-- silently rounds and a poured spirit never moves at all. inventory_items was
-- created outside this repo's migrations, so its types cannot be read from the
-- codebase and have to be checked against the live database.
--
-- HOW TO READ THE OUTPUT
--
--   OK            nothing to do.
--   BLOCKING      must be widened; poured items cannot deplete correctly.
--   WARN          works, but will round in a way somebody will eventually query.
--   MISSING       the column does not exist at all — check the table name.
--
-- Query 3 writes the ALTER statements for you if anything comes back BLOCKING.
--
-- RUNNING IT: there are six queries below. The Supabase SQL Editor may show
-- only the LAST result set when several statements are run together, so if you
-- see the row counts from query 4 and nothing else, highlight one query at a
-- time and press Run. Query 1 is the one that answers the question.

-- ============================================================================
--  QUERY 1 — the verdict table. This is the one to read.
-- ============================================================================
WITH expected(tbl, col, requirement, note) AS (
  VALUES
    -- The blocking one. Pour depletion subtracts fractions of a unit from this.
    ('inventory_items',        'current_stock',  'fractional',
     'A 1.5oz pour off a 750ml bottle deducts ~0.059 -- needs a scale'),

    -- Money. Integral money columns would be a separate, worse bug, but check
    -- them while we are here.
    ('inventory_items',        'cost_price',     'fractional',
     'Per unit of stock. Feeds COGS = usage_logs.quantity x cost_price'),
    ('inventory_items',        'sale_price',     'fractional',
     'Per POS sale, not per unit of stock'),

    -- Par is compared against current_stock, so a fractional stock level and an
    -- integral par produce a below-par flag that flickers.
    ('inventory_items',        'par_level',      'fractional',
     'Compared against current_stock; should match its precision'),

    -- The two inputs to servings-per-unit. pour_size_oz MUST be fractional --
    -- a 1.5oz pour is the single most common value in any bar.
    ('inventory_items',        'bottle_size_ml', 'any',
     'Container size -- the denominator of the pour conversion'),
    ('inventory_items',        'pour_size_oz',   'fractional',
     'Pour size. 1.5oz is the commonest value and must not round to 2'),

    -- Already NUMERIC(12,4) per migration 20260817000003, but confirm the
    -- migration actually landed on this database.
    ('usage_logs',             'quantity',       'fractional',
     'Must be in STOCK units -- this is what COGS multiplies by cost_price'),

    -- Already NUMERIC(14,4) per the same migration.
    ('pos_stock_applications', 'applied_qty',    'fractional',
     'POS-unit memory that makes re-sent sync windows idempotent'),

    -- The middle link of the item -> category -> organisation pour chain.
    ('inventory_categories',   'default_pour_oz', 'fractional',
     'Category pour default, used when an item has none of its own'),

    -- Distinguishes a whole-unit recipe line from a measured pour.
    ('pos_bundle_components',  'unit',           'any',
     'each | oz -- ignored by the deals panel until 2026-08-19')
)
SELECT
  e.tbl                                   AS table_name,
  e.col                                   AS column_name,
  COALESCE(c.data_type, '-')              AS data_type,
  -- NULL precision/scale on a bare NUMERIC means arbitrary precision, which is
  -- fractional. Rendering that as 'unconstrained' avoids it reading as missing.
  CASE
    WHEN c.column_name IS NULL                      THEN '-'
    WHEN c.numeric_precision IS NULL                THEN 'unconstrained'
    ELSE c.numeric_precision || ',' || COALESCE(c.numeric_scale::TEXT, '?')
  END                                     AS precision_scale,
  CASE
    -- Column absent entirely.
    WHEN c.column_name IS NULL THEN 'MISSING'

    -- Requirement is only that it exists.
    WHEN e.requirement = 'any' THEN 'OK'

    -- Genuinely fractional: floating point, or numeric with a scale, or a bare
    -- unconstrained numeric.
    WHEN c.data_type IN ('double precision', 'real') THEN 'OK'
    WHEN c.data_type IN ('numeric', 'decimal')
         AND (c.numeric_scale IS NULL OR c.numeric_scale > 0) THEN 'OK'

    -- Integer family, or numeric pinned to scale 0. This is the failure case.
    WHEN c.data_type IN ('integer', 'bigint', 'smallint') THEN
      CASE WHEN e.col = 'current_stock' THEN 'BLOCKING' ELSE 'WARN' END
    WHEN c.data_type IN ('numeric', 'decimal') AND c.numeric_scale = 0 THEN
      CASE WHEN e.col = 'current_stock' THEN 'BLOCKING' ELSE 'WARN' END

    ELSE 'WARN (unexpected type)'
  END                                     AS verdict,
  e.note
FROM expected e
LEFT JOIN information_schema.columns c
  ON  c.table_schema = 'public'
  AND c.table_name   = e.tbl
  AND c.column_name  = e.col
ORDER BY
  -- Problems first, so a long list cannot hide the one that matters.
  CASE
    WHEN c.column_name IS NULL THEN 0
    WHEN c.data_type IN ('integer','bigint','smallint') THEN 0
    WHEN c.data_type IN ('numeric','decimal') AND c.numeric_scale = 0 THEN 0
    ELSE 1
  END,
  e.tbl, e.col;


-- ============================================================================
--  QUERY 2 — do the tables even exist under the names assumed above?
--
--  A wall of MISSING in query 1 usually means a table is named differently on
--  this database, not that every column vanished.
-- ============================================================================
SELECT
  t.name                                            AS expected_table,
  CASE WHEN i.table_name IS NULL THEN 'MISSING' ELSE 'ok' END AS status
FROM (VALUES
  ('inventory_items'),
  ('usage_logs'),
  ('pos_stock_applications'),
  ('pos_item_sales'),
  ('pos_bundle_components'),
  ('inventory_categories')
) AS t(name)
LEFT JOIN information_schema.tables i
  ON  i.table_schema = 'public'
  AND i.table_name   = t.name
ORDER BY status, expected_table;


-- ============================================================================
--  QUERY 3 — the fix, written for you.
--
--  Returns one ALTER statement per column that came back BLOCKING or WARN in
--  query 1. Returns NO ROWS if nothing needs changing, which is the result you
--  want.
--
--  Read them before running them. Widening a numeric column rewrites the table,
--  so on a large inventory_items do it in a maintenance window.
-- ============================================================================
SELECT
  'ALTER TABLE ' || quote_ident(c.table_name)
    || ' ALTER COLUMN ' || quote_ident(c.column_name)
    || ' TYPE NUMERIC(14,4);'                       AS fix_statement,
  c.data_type                                       AS current_type
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND (
    (c.table_name = 'inventory_items'
     AND c.column_name IN ('current_stock', 'cost_price', 'sale_price', 'par_level', 'pour_size_oz'))
    OR (c.table_name = 'usage_logs'             AND c.column_name = 'quantity')
    OR (c.table_name = 'pos_stock_applications' AND c.column_name = 'applied_qty')
  )
  AND (
    c.data_type IN ('integer', 'bigint', 'smallint')
    OR (c.data_type IN ('numeric', 'decimal') AND c.numeric_scale = 0)
  )
ORDER BY c.table_name, c.column_name;


-- ============================================================================
--  QUERY 4 — reality check: is anything already fractional?
--
--  If current_stock is an integer type this returns 0 for everything, which
--  tells you nothing new. If it is numeric, a count of 0 fractional rows across
--  a large catalogue is a hint that a bar has been entering spirits in whole
--  shot-units as a workaround -- which the setup queue has to detect and
--  convert rather than silently re-divide. See open question 2 in the spec.
-- ============================================================================
SELECT
  COUNT(*)                                                        AS items_total,
  COUNT(*) FILTER (WHERE current_stock <> FLOOR(current_stock))   AS items_with_fractional_stock,
  COUNT(*) FILTER (WHERE bottle_size_ml IS NOT NULL)              AS items_with_a_bottle_size,
  COUNT(*) FILTER (WHERE bottle_size_ml IS NOT NULL
                     AND pour_size_oz IS NOT NULL)                AS serving_mode_candidates
FROM inventory_items;


-- ============================================================================
--  QUERY 5 — is any bar already holding spirits in SHOT-units?
--
--  This is the question query 4 cannot answer. A near-zero fractional count
--  proves nothing: stock held in whole bottles is whole numbers too.
--
--  What discriminates is MAGNITUDE. A 750ml bottle yields ~17 pours at 1.5oz,
--  so an item counted in bottles sits in single or low double digits, while the
--  same item counted in shots sits in the hundreds.
--
--  Any row in the 'shots?' band must be CONVERTED when it is switched to
--  serving mode, not just re-flagged -- its current_stock is already divided,
--  and dividing again would collapse it. Spec, open question 2.
-- ============================================================================
SELECT
  -- Broken out per bar, because this is a per-bar habit: one operator counting
  -- in shots does not tell you anything about the others, and the conversion
  -- has to be applied to that org's items specifically.
  o.name                                                 AS bar,
  CASE
    WHEN i.current_stock IS NULL       THEN '0 - no stock recorded'
    WHEN i.current_stock = 0           THEN '1 - empty'
    WHEN i.current_stock <= 24         THEN '2 - looks like BOTTLES'
    WHEN i.current_stock <= 60         THEN '3 - ambiguous, needs a human'
    ELSE                                    '4 - looks like SHOTS (convert!)'
  END                                                    AS stock_unit_guess,
  COUNT(*)                                               AS items,
  ROUND(MIN(i.current_stock), 2)                         AS min_stock,
  ROUND(AVG(i.current_stock), 2)                         AS avg_stock,
  ROUND(MAX(i.current_stock), 2)                         AS max_stock,
  -- Rough servings a full unit yields, to sanity-check the bands above against
  -- this bar's actual pour sizes rather than the 17 assumed in the comment.
  ROUND(AVG((i.bottle_size_ml * 0.033814) / NULLIF(i.pour_size_oz, 0)), 1)
                                                         AS avg_servings_per_unit
FROM inventory_items i
JOIN organizations o ON o.id = i.organization_id
WHERE i.bottle_size_ml IS NOT NULL
  AND i.pour_size_oz   IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2;


-- ============================================================================
--  QUERY 6 — items that really are missing a pour.
--
--  NOT simply "pour_size_oz IS NULL". A null pour on the item is completely
--  normal: the pour resolves item -> category -> organisation, so the wine
--  bottles seeded with no item pour still pick up the 5oz category default that
--  20260819000000_add_pour_tracking.sql sets. Flagging those sends somebody to
--  fix rows that are already right.
--
--  What actually misconfigures an item is having a CONTAINER size while all
--  three levels of the pour chain are empty. lib/pos/pour.ts then returns 1 and
--  the item quietly deducts a whole bottle per sale -- the exact case
--  describePour() warns about in the item form.
--
--  resolved_pour_oz shows the winning value and pour_source shows which level
--  it came from, so a surprising deduction can be traced without guessing.
-- ============================================================================
SELECT
  o.name                        AS bar,
  i.name,
  i.unit,
  i.bottle_size_ml,
  i.current_stock,
  COALESCE(
    NULLIF(i.pour_size_oz, 0),
    NULLIF(c.default_pour_oz, 0),
    NULLIF((o.bar_settings ->> 'default_pour_oz')::NUMERIC, 0)
  )                             AS resolved_pour_oz,
  CASE
    WHEN NULLIF(i.pour_size_oz, 0)     IS NOT NULL THEN 'item'
    WHEN NULLIF(c.default_pour_oz, 0)  IS NOT NULL THEN 'category'
    WHEN NULLIF((o.bar_settings ->> 'default_pour_oz')::NUMERIC, 0) IS NOT NULL
      THEN 'organisation'
    ELSE 'NONE - deducts a whole unit per sale'
  END                           AS pour_source
FROM inventory_items i
JOIN organizations o        ON o.id = i.organization_id
LEFT JOIN inventory_categories c ON c.id = i.category_id
WHERE i.bottle_size_ml IS NOT NULL
  AND i.bottle_size_ml > 0
  -- Every level of the chain empty. This is the real misconfiguration.
  AND COALESCE(
        NULLIF(i.pour_size_oz, 0),
        NULLIF(c.default_pour_oz, 0),
        NULLIF((o.bar_settings ->> 'default_pour_oz')::NUMERIC, 0)
      ) IS NULL
ORDER BY o.name, i.current_stock DESC NULLS LAST, i.name
LIMIT 200;
