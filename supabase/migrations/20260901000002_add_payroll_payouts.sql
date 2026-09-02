-- ── Payout tracking ──────────────────────────────────────────────────────────
-- payroll_runs answers "have these numbers been signed off". It does not answer
-- "has Dana actually been handed her money", which is the question an owner has
-- halfway through a Friday afternoon with six of eight cheques written.
--
-- A payout is one row per employee per pay period. UNPAID IS THE ABSENCE OF A
-- ROW — there is no status column, so nothing here can go stale against a run
-- that was recomputed underneath it, and un-marking is a plain DELETE.

CREATE TABLE IF NOT EXISTS payroll_payouts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id     UUID        NOT NULL REFERENCES employees(id)     ON DELETE CASCADE,

  period_start    DATE        NOT NULL,
  period_end      DATE        NOT NULL,

  method          TEXT        NOT NULL
                  CHECK (method IN ('cash', 'direct_deposit', 'check', 'other')),

  -- What was handed over, frozen at mark time. Deliberately NOT re-read from
  -- the live recompute: a shift corrected next week must not rewrite the
  -- record of money that already moved. Being able to see the two disagree is
  -- the whole point of storing it.
  amount_paid     NUMERIC(12,2) NOT NULL DEFAULT 0,

  paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marked_by       UUID        NOT NULL REFERENCES auth.users(id),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One payout per person per period. Makes a double-tap on a slow phone
-- connection an idempotent no-op rather than a second row that would read as
-- having paid somebody twice.
CREATE UNIQUE INDEX IF NOT EXISTS ux_payroll_payout_employee_period
  ON payroll_payouts (organization_id, employee_id, period_start, period_end);

-- The payroll screen's only read: every payout for the period on show.
CREATE INDEX IF NOT EXISTS ix_payroll_payout_period
  ON payroll_payouts (organization_id, period_start, period_end);

ALTER TABLE payroll_payouts ENABLE ROW LEVEL SECURITY;

-- Reads follow membership, matching payroll_runs. Writes go through server
-- actions that gate on canManagePayroll() and use the service-role client.
CREATE POLICY "org members read payroll payouts"
  ON payroll_payouts FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM memberships WHERE user_id = auth.uid()
  ));
