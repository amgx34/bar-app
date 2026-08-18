-- Closes a cross-tenant data leak on three tables that never had RLS enabled.
--
-- WHAT WAS EXPOSED
--
-- These tables were created before this repo's migration set and were never
-- given row level security. The anon key ships in the browser bundle and is
-- public by design, so anyone who loaded the marketing page could read:
--
--   usage_logs           984 rows across 37 organisations — every bar's stock
--                        movements, including delivery notes naming suppliers
--                        and purchase order numbers. Also WRITABLE: a valid
--                        insert with another org's id succeeded, so anyone
--                        could fabricate stock movements in any bar's account.
--
--   inventory_categories 208 rows — every bar's category structure.
--
--   demo_requests        Lead records: name, business, email, phone, message.
--                        Personal data belonging to people who filled in a
--                        contact form.
--
-- Enabling RLS with no policy denies everything except the service role, which
-- bypasses RLS by design. So the safe default here is to enable first and add
-- back only the reads the app actually performs through a user session.
--
-- WHAT THE APP NEEDS
--
-- Almost every read of these tables goes through createAdminClient() (service
-- role), which is unaffected. The exceptions, checked one by one:
--
--   usage_logs           app/(app)/app/books/actions.ts reads it with the
--                        cookie-scoped client -> needs a member SELECT policy.
--   inventory_categories app/(app)/setup/actions.ts uses the cookie client ->
--                        needs a member SELECT policy.
--   demo_requests        written only by submitDemoRequest via the service
--                        role, and never read from a browser session -> no
--                        policy at all, which is what keeps lead PII private.
--
-- No INSERT/UPDATE/DELETE policies are added anywhere here. Every write in the
-- app goes through the service role or a SECURITY DEFINER function, so granting
-- write access to a session would widen the surface for no benefit.

-- ── usage_logs ───────────────────────────────────────────────────────────────

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_read_usage_logs" ON usage_logs;

CREATE POLICY "org_members_read_usage_logs"
  ON usage_logs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- ── inventory_categories ─────────────────────────────────────────────────────

ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_read_inventory_categories" ON inventory_categories;

CREATE POLICY "org_members_read_inventory_categories"
  ON inventory_categories FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- ── demo_requests ────────────────────────────────────────────────────────────

-- Deliberately no policy. These are inbound leads containing personal data and
-- they belong to no organisation, so there is no membership to scope them by.
-- The contact form writes through the service role; nothing in a browser
-- session should ever read them back.
ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;
