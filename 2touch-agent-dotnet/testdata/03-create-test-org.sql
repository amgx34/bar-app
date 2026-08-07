-- ═══════════════════════════════════════════════════════════════════════════
-- Create an ISOLATED test organization for 2Touch agent testing.
-- Run in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- WHY A SEPARATE ORG: POST /api/2touch/ingest auto-creates employees,
-- inventory_items, and inventory_categories in whatever org the payload names
-- (see app/api/2touch/ingest/route.ts). Pointing the agent at your real bar
-- would mix seeded staff ("Alex Rivera") and fake sales into live payroll and
-- inventory. A throwaway org keeps that contained and deletable.
--
-- Outputs the org_id and agent_token to paste into appsettings.local.json.
-- ═══════════════════════════════════════════════════════════════════════════

-- Reuse the existing test org if this is re-run, otherwise mint a new one.
INSERT INTO organizations (name, slug, bar_type, pos_provider, pos_config, bar_settings)
VALUES (
  '2Touch Agent Test Bar',
  '2touch-agent-test',
  'bar',
  '2touch',
  jsonb_build_object(
    -- Per-org HMAC key. gen_random_uuid() twice = 64 hex chars, matching the
    -- randomBytes(32).toString('hex') token that save2TouchConfig() generates.
    'agent_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    'is_test_org', true
  ),
  jsonb_build_object(
    'tip_split_percent',   15,
    'barback_tip_pct',     15,
    'default_hourly_rate', 15.00,
    'hourly_rates',        '{}'::jsonb,
    'default_pour_oz',     1.5,
    'bar_type',            'bar',
    'auto_reorder_enabled', false,
    'opener_bonus_type',   'none',
    'opener_bonus_value',  0
  )
)
ON CONFLICT (slug) DO NOTHING;

-- ── Copy these two values into appsettings.local.json → Agent:Rail ──────────
SELECT
  id                        AS "OrgId",
  pos_config ->> 'agent_token' AS "AuthToken"
FROM organizations
WHERE slug = '2touch-agent-test';


-- ═══════════════════════════════════════════════════════════════════════════
-- OPTIONAL — grant yourself access so the test org shows up in the Rail UI.
-- Without a membership the ingest still works; you just can't view the data.
-- Replace the email, then uncomment.
-- ═══════════════════════════════════════════════════════════════════════════

-- INSERT INTO memberships (user_id, organization_id, role)
-- SELECT u.id, o.id, 'owner'
-- FROM auth.users u
-- CROSS JOIN organizations o
-- WHERE u.email = 'decksharer@gmail.com'
--   AND o.slug  = '2touch-agent-test'
-- ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- TEARDOWN — removes the test org and every row that references it.
-- All child tables use ON DELETE CASCADE, so this cleans up the seeded
-- employees, shifts, z_report_days, and inventory in one statement.
-- ═══════════════════════════════════════════════════════════════════════════

-- DELETE FROM organizations WHERE slug = '2touch-agent-test';
