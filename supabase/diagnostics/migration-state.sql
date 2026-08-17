-- What has actually been applied, for migrations 20260817000002-4.
--
-- Read-only. Run this after a migration aborts partway: the Supabase SQL editor
-- reports only the first error, so a file that fails on statement 9 leaves you
-- guessing which of the previous 8 landed.
--
-- Every row should read 'ok'. Anything reading 'MISSING' means re-running the
-- migration that creates it — all three are idempotent now.

WITH expected(kind, name, migration) AS (
  VALUES
    -- 20260817000002 — deal exclusions
    ('table',    'pos_excluded_items',                       '000002'),
    ('index',    'idx_pos_excluded_org',                     '000002'),
    ('function', 'pos_item_match_key',                       '000002'),
    ('policy',   'org_members_read_pos_excluded',            '000002'),
    ('policy',   'org_members_write_pos_excluded',           '000002'),
    ('policy',   'org_members_delete_pos_excluded',          '000002'),

    -- 20260817000003 — bundles and stock depletion
    ('table',    'pos_bundles',                              '000003'),
    ('table',    'pos_bundle_components',                    '000003'),
    ('table',    'pos_item_sales',                           '000003'),
    ('table',    'pos_stock_applications',                   '000003'),
    ('index',    'idx_pos_bundles_org',                      '000003'),
    ('index',    'idx_pos_bundle_components_bundle',         '000003'),
    ('index',    'idx_pos_item_sales_org_date',              '000003'),
    ('index',    'idx_pos_stock_applications_org_date',      '000003'),
    ('function', 'pos_apply_item_sales',                     '000003'),
    ('policy',   'org_members_all_pos_bundles',              '000003'),
    ('policy',   'org_members_all_pos_bundle_components',    '000003'),
    ('policy',   'org_members_read_pos_item_sales',          '000003'),
    ('policy',   'org_members_read_pos_stock_applications',  '000003'),

    -- 20260817000004 — terms acceptance
    ('table',    'terms_acceptances',                        '000004'),
    ('index',    'idx_terms_acceptances_user',               '000004'),
    ('policy',   'users_read_own_terms_acceptances',         '000004')
)
SELECT
  e.migration,
  e.kind,
  e.name,
  CASE WHEN found THEN 'ok' ELSE 'MISSING' END AS status
FROM expected e
CROSS JOIN LATERAL (
  SELECT CASE e.kind
    WHEN 'table' THEN
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relname = e.name AND c.relkind = 'r')
    WHEN 'index' THEN
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relname = e.name AND c.relkind = 'i')
    WHEN 'function' THEN
      EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = e.name)
    WHEN 'policy' THEN
      EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = e.name)
  END AS found
) f
ORDER BY e.migration, e.kind, e.name;

-- Row level security must be ON for each new table, or the read policies above
-- are decoration and any authenticated user sees every bar's rows.
SELECT
  c.relname AS table_name,
  CASE WHEN c.relrowsecurity THEN 'enabled' ELSE 'DISABLED — FIX THIS' END AS row_level_security
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'pos_excluded_items', 'pos_bundles', 'pos_bundle_components',
    'pos_item_sales', 'pos_stock_applications', 'terms_acceptances'
  )
ORDER BY c.relname;

-- usage_logs.reason is the enum `usage_reason`. Both new values must be present
-- or every depletion write fails and the ingest reports errors forever.
SELECT
  v.expected AS reason_value,
  CASE WHEN e.enumlabel IS NULL THEN 'MISSING — re-run 000003' ELSE 'ok' END AS status
FROM (VALUES ('pos_sale'), ('pos_reversal')) AS v(expected)
LEFT JOIN pg_enum e
  ON e.enumlabel = v.expected
 AND e.enumtypid = (
   SELECT t.oid FROM pg_type t
   JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' AND t.typname = 'usage_reason'
 );

-- What the enum actually holds right now, in sort order. Useful when the check
-- above says MISSING and you need to see what the column will accept.
SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS usage_reason_values
FROM pg_enum e
JOIN pg_type t      ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typname = 'usage_reason';
