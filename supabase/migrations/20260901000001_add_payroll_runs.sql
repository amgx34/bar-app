-- ── Payroll approval ─────────────────────────────────────────────────────────
-- Payroll had no persisted run: computePayroll(start, end) recalculates live
-- from employee_shifts + z_report_days + payroll_adjustments on every page load.
--
-- Approving a live computation is meaningless — a manager submits Monday's
-- figures, someone corrects a shift on Tuesday, and the owner approves numbers
-- they never saw. So a run is a SNAPSHOT, frozen at submit, and the approval
-- screen diffs it against a fresh recompute before letting anyone sign off.

CREATE TABLE IF NOT EXISTS payroll_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  period_start    DATE        NOT NULL,
  period_end      DATE        NOT NULL,

  status          TEXT        NOT NULL DEFAULT 'pending_approval'
                  CHECK (status IN ('pending_approval', 'approved', 'changes_requested')),

  -- computePayroll() output + totals as they stood at submit time.
  snapshot        JSONB       NOT NULL,

  submitted_by    UUID        NOT NULL REFERENCES auth.users(id),
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  reviewed_by     UUID        REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,

  -- Set when an owner exports NACHA for a period that was not approved. The
  -- override is allowed — payroll must never be blocked by a bug in its own
  -- workflow at 6pm on a Friday — but it is never silent.
  override_reason TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One live run per period. A send-back sets status='changes_requested' and the
-- resubmit UPDATEs that row rather than stacking a second one, so "the run for
-- this period" is always a single unambiguous answer.
CREATE UNIQUE INDEX IF NOT EXISTS ux_payroll_run_period
  ON payroll_runs (organization_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS ix_payroll_run_pending
  ON payroll_runs (organization_id, status, submitted_at DESC);

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;

-- Reads follow membership; the write paths all go through server actions that
-- gate on role via lib/permissions.tsx, and use the service-role client.
CREATE POLICY "org members read payroll runs"
  ON payroll_runs FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM memberships WHERE user_id = auth.uid()
  ));
