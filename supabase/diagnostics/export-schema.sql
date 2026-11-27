-- export-schema.sql
--
-- READ-ONLY. Describes the STRUCTURE of the `public` schema and nothing else:
-- no row data, no secrets. Run it in the Supabase SQL editor of the project you
-- want to describe and save the result (Download CSV, or copy as JSON) to
-- supabase/schema-export/. scripts/schema/build-baseline.ts turns that into SQL
-- that recreates the structure in an empty project.
--
-- Returns ten rows: (section text, payload jsonb). Each payload is a JSON array.
-- Column names in the payloads match `SchemaExport` in
-- scripts/schema/schema-to-sql.ts. Extension-owned objects are left out.
--
-- `uncovered` lists things that exist but that the baseline will NOT recreate
-- (views, materialized views, foreign tables, domains, composite and range
-- types), so a gap is visible instead of silent. Storage buckets and their
-- policies live in the `storage` schema and are not covered.

SELECT 'enums' AS section,
       COALESCE(jsonb_agg(jsonb_build_object(
         'name', t.typname,
         'labels', (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
                    FROM pg_enum e WHERE e.enumtypid = t.oid)
       ) ORDER BY t.typname), '[]'::jsonb) AS payload
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype = 'e'

UNION ALL

-- Serial-style sequences. Identity sequences are internal to their column and
-- are recreated by GENERATED ... AS IDENTITY, so they are skipped here.
SELECT 'sequences',
       COALESCE(jsonb_agg(jsonb_build_object(
         'name', c.relname,
         'dataType', format_type(s.seqtypid, NULL)
       ) ORDER BY c.relname), '[]'::jsonb)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_sequence s ON s.seqrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'S'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'i')

UNION ALL

SELECT 'tables',
       COALESCE(jsonb_agg(jsonb_build_object(
         'name', c.relname,
         'rls', c.relrowsecurity
       ) ORDER BY c.relname), '[]'::jsonb)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')

UNION ALL

SELECT 'columns',
       COALESCE(jsonb_agg(jsonb_build_object(
         'table', c.relname,
         'name', a.attname,
         'position', a.attnum,
         'type', format_type(a.atttypid, a.atttypmod),
         'notNull', a.attnotnull,
         'default', CASE WHEN a.attgenerated = '' THEN pg_get_expr(d.adbin, d.adrelid) END,
         'identity', CASE a.attidentity WHEN 'a' THEN 'always' WHEN 'd' THEN 'by default' END,
         'generated', CASE WHEN a.attgenerated = 's' THEN pg_get_expr(d.adbin, d.adrelid) END
       ) ORDER BY c.relname, a.attnum), '[]'::jsonb)
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
  AND a.attnum > 0 AND NOT a.attisdropped
  AND NOT EXISTS (SELECT 1 FROM pg_depend x WHERE x.objid = c.oid AND x.deptype = 'e')

UNION ALL

-- Primary, unique, foreign-key and check constraints, as Postgres itself prints them.
SELECT 'constraints',
       COALESCE(jsonb_agg(jsonb_build_object(
         'table', c.relname,
         'name', k.conname,
         'kind', k.contype::text,
         'definition', pg_get_constraintdef(k.oid)
       ) ORDER BY c.relname, k.conname), '[]'::jsonb)
FROM pg_constraint k
JOIN pg_class c ON c.oid = k.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND k.contype IN ('p', 'u', 'f', 'c')
  AND c.relkind IN ('r', 'p') AND NOT c.relispartition

UNION ALL

-- Indexes that are not already created by a primary-key or unique constraint.
SELECT 'indexes',
       COALESCE(jsonb_agg(jsonb_build_object(
         'table', i.tablename,
         'name', i.indexname,
         'definition', i.indexdef
       ) ORDER BY i.tablename, i.indexname), '[]'::jsonb)
FROM pg_indexes i
WHERE i.schemaname = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint k
    JOIN pg_namespace kn ON kn.oid = k.connamespace
    WHERE kn.nspname = 'public' AND k.conname = i.indexname AND k.contype IN ('p', 'u')
  )

UNION ALL

SELECT 'policies',
       COALESCE(jsonb_agg(jsonb_build_object(
         'table', p.tablename,
         'name', p.policyname,
         'permissive', p.permissive = 'PERMISSIVE',
         'command', p.cmd,
         'roles', to_jsonb(p.roles),
         'using', p.qual,
         'check', p.with_check
       ) ORDER BY p.tablename, p.policyname), '[]'::jsonb)
FROM pg_policies p
WHERE p.schemaname = 'public'

UNION ALL

SELECT 'functions',
       COALESCE(jsonb_agg(jsonb_build_object(
         'name', f.proname || '(' || pg_get_function_identity_arguments(f.oid) || ')',
         'definition', pg_get_functiondef(f.oid)
       ) ORDER BY f.proname, f.oid), '[]'::jsonb)
FROM pg_proc f
JOIN pg_namespace n ON n.oid = f.pronamespace
WHERE n.nspname = 'public' AND f.prokind IN ('f', 'p')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = f.oid AND d.deptype = 'e')

UNION ALL

SELECT 'triggers',
       COALESCE(jsonb_agg(jsonb_build_object(
         'table', c.relname,
         'name', t.tgname,
         'definition', pg_get_triggerdef(t.oid)
       ) ORDER BY c.relname, t.tgname), '[]'::jsonb)
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal

UNION ALL

SELECT 'uncovered',
       COALESCE(jsonb_agg(jsonb_build_object('kind', u.kind, 'name', u.name)
                          ORDER BY u.kind, u.name), '[]'::jsonb)
FROM (
  SELECT CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE 'foreign table' END AS kind,
         c.relname::text AS name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm', 'f')
  UNION ALL
  SELECT CASE t.typtype WHEN 'd' THEN 'domain' WHEN 'r' THEN 'range type' ELSE 'composite type' END,
         t.typname::text
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  LEFT JOIN pg_class rc ON rc.oid = t.typrelid
  WHERE n.nspname = 'public'
    AND (t.typtype IN ('d', 'r') OR (t.typtype = 'c' AND rc.relkind = 'c'))
) u;
