-- Manual corrections to a pay run, and the record of who made them.
--
-- Two things an operator needs that the app could not do:
--
--   1. Correct recorded hours. A clock-out that never happened, a shift the POS
--      logged against the wrong person, a cover that ran long.
--   2. Move tips between people. Cover swaps and disputes get settled at the
--      bar, and the split then has to match what was actually agreed.
--
-- Both change what someone is paid, so neither is allowed to happen silently.
-- Every adjustment is a row here with a reason and an author, and the original
-- figure is preserved: `hours_before` is what the POS said, and it is never
-- overwritten by a later correction to the same shift.

-- ── Who opened ───────────────────────────────────────────────────────────────

-- The opener bonus has been configurable since the app was built but has never
-- paid out, because nothing recorded WHO opened. employee_shifts carries
-- time_in/time_out columns, but no ingest path populates them — the agent and
-- the CSV importer both write hours only. So this is explicit rather than
-- derived: the operator marks the opener, because the operator is the only
-- party that actually knows.
ALTER TABLE employee_shifts
  ADD COLUMN IF NOT EXISTS is_opener BOOLEAN NOT NULL DEFAULT FALSE;

-- Finding the opener for a night is the hot path when the bonus is enabled.
CREATE INDEX IF NOT EXISTS idx_employee_shifts_opener
  ON employee_shifts(organization_id, shift_date)
  WHERE is_opener;

-- ── Adjustment log ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shift_date      DATE        NOT NULL,

  -- 'hours'        — employee_id's recorded hours were corrected
  -- 'tip_transfer' — amount moved FROM employee_id TO counterparty_employee_id
  kind            TEXT        NOT NULL CHECK (kind IN ('hours', 'tip_transfer')),

  employee_id     UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- hours only. Both stored so the log stands alone as evidence: reading the
  -- shift row later tells you the current figure, not what it replaced.
  hours_before    NUMERIC(6,2),
  hours_after     NUMERIC(6,2),

  -- tip_transfer only. Always positive; direction is employee_id -> counterparty.
  counterparty_employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2),

  reason          TEXT        NOT NULL,
  -- Nullable so deleting a user account never destroys the audit trail. The
  -- adjustment still happened, and the reason and timestamp still stand.
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each kind must carry its own fields and only its own, so a malformed row
  -- cannot be applied as though it were the other kind.
  CONSTRAINT payroll_adjustments_shape CHECK (
    (kind = 'hours'
      AND hours_before IS NOT NULL AND hours_after IS NOT NULL
      AND counterparty_employee_id IS NULL AND amount IS NULL)
    OR
    (kind = 'tip_transfer'
      AND counterparty_employee_id IS NOT NULL AND amount IS NOT NULL AND amount > 0
      AND hours_before IS NULL AND hours_after IS NULL)
  ),

  -- Moving tips to yourself is not a transfer.
  CONSTRAINT payroll_adjustments_distinct_parties CHECK (
    counterparty_employee_id IS NULL OR counterparty_employee_id <> employee_id
  )
);

-- Payroll reads every adjustment for a date range on each run.
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_org_date
  ON payroll_adjustments(organization_id, shift_date);

ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;

-- Postgres has no CREATE POLICY IF NOT EXISTS; dropping first keeps this file
-- safe to run more than once.
DROP POLICY IF EXISTS "org_members_read_payroll_adjustments" ON payroll_adjustments;

-- Read-only to members. Writes go through the server action, which is what
-- stamps created_by from the session rather than trusting the browser.
--
-- There is deliberately no UPDATE or DELETE policy: an audit row the audited
-- party can edit is not evidence of anything. Correcting a mistaken adjustment
-- means adding another one, which is the behaviour a pay dispute needs.
CREATE POLICY "org_members_read_payroll_adjustments"
  ON payroll_adjustments FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );
