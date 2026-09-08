-- ── Employee portal accounts ─────────────────────────────────────────────────
-- An employee is NOT an org member. ensure_full_schema.sql creates FOR ALL
-- policies over employees, employee_shifts and direct_deposit_accounts keyed on
-- the memberships table, so a membership row for a bartender would hand them
-- every colleague's bank details and the ability to edit their own hours.
-- This table links an auth user to one employees row and nothing else.

CREATE TABLE IF NOT EXISTS employee_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Nullable on purpose: a claim whose typed name matched two employees is
  -- recorded unresolved for a manager to settle. The CHECK below is what stops
  -- an unresolved claim from ever becoming a login.
  employee_id     UUID        REFERENCES employees(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- A real status column, unlike payroll_payouts where absence means unpaid.
  -- A rejected claim must be distinguishable from one never made, or a manager
  -- who declines an impostor watches them reappear in the queue forever.
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'active', 'revoked')),

  -- What the person typed, not the employee's name. When a manager reviews a
  -- claim the useful question is whether this person typed something that
  -- plausibly identifies them, and the typed string is the evidence.
  claimed_name    TEXT        NOT NULL,

  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by      UUID        REFERENCES auth.users(id),
  decided_at      TIMESTAMPTZ,

  CONSTRAINT active_accounts_name_an_employee
    CHECK (status <> 'active' OR employee_id IS NOT NULL)
);

-- One live account per employee record: two people cannot both be Dana.
-- Postgres treats NULLs as distinct here, so several unresolved claims coexist.
CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_account_employee
  ON employee_accounts (organization_id, employee_id)
  WHERE status <> 'revoked';

-- One claim per person per bar, so a double-tapped sign-up on a slow phone is
-- an idempotent no-op rather than a second pending row.
CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_account_user
  ON employee_accounts (user_id, organization_id);

-- The manager queue's only read.
CREATE INDEX IF NOT EXISTS ix_employee_account_pending
  ON employee_accounts (organization_id, status, requested_at DESC);

ALTER TABLE employee_accounts ENABLE ROW LEVEL SECURITY;

-- An employee may see their own row and nothing else — this is what powers the
-- "waiting for approval" screen. Every other access is server-side through the
-- service-role client, scoped by hand.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'employee_accounts'
      AND policyname = 'employees read their own account'
  ) THEN
    CREATE POLICY "employees read their own account"
      ON employee_accounts FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ── Staff join code ──────────────────────────────────────────────────────────
-- NULL means staff sign-up is OFF for that bar, which is what every existing
-- org gets. Turning it on is a deliberate act in Settings.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS staff_join_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_org_staff_join_code
  ON organizations (staff_join_code)
  WHERE staff_join_code IS NOT NULL;
