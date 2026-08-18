-- Record of who agreed to which version of the Terms, and when.
--
-- One row per (user, version) rather than a column on a profile. An acceptance
-- is evidence: it must never be overwritten when the terms change, because the
-- question later is always "what did this person agree to on the day they
-- signed up", not "what is the newest thing they clicked". Publishing a new
-- version therefore adds rows, and the old rows stay exactly as they were.
--
-- Rail handles payroll, tip allocations and ACH bank details, so the acceptance
-- trail is worth keeping properly.

CREATE TABLE IF NOT EXISTS terms_acceptances (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Matches TERMS_VERSION in lib/legal.ts. Stored as the literal string so a
  -- later code change can never retroactively relabel what someone agreed to.
  terms_version   TEXT        NOT NULL,
  accepted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Evidence of the circumstances. Nullable: a missing IP must never be the
  -- reason an acceptance fails to record.
  ip_address      TEXT,
  user_agent      TEXT,
  -- Which bar they were acting for, where that is known. ON DELETE SET NULL so
  -- deleting an organisation never destroys the acceptance record itself.
  organization_id UUID        REFERENCES organizations(id) ON DELETE SET NULL,

  UNIQUE (user_id, terms_version)
);

-- The gate asks "has this user accepted the current version" on app entry.
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user
  ON terms_acceptances(user_id, terms_version);

ALTER TABLE terms_acceptances ENABLE ROW LEVEL SECURITY;

-- Postgres has no CREATE POLICY IF NOT EXISTS; dropping first keeps this file
-- safe to run more than once.
DROP POLICY IF EXISTS "users_read_own_terms_acceptances" ON terms_acceptances;

-- A user may read their own acceptances, and nothing else. There is
-- deliberately no UPDATE or DELETE policy: an acceptance record that the
-- accepting party can edit is not evidence of anything.
CREATE POLICY "users_read_own_terms_acceptances"
  ON terms_acceptances FOR SELECT
  USING (user_id = auth.uid());

-- INSERT is service-role only (the server action), so the recorded IP, user
-- agent and version come from the server rather than from whatever the browser
-- claims.
