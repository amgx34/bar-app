-- Let a barback be paid straight hourly instead of taking a cut of the tips.
--
-- WHAT WAS ALREADY TRUE
--
-- Barbacks are not, and never were, "percentage-only" staff. They already earn
-- an hourly wage: employees.hourly_rate is set for them, and the payroll engine
-- pays regular_hours * hourly_rate exactly as it does for a bartender.
--
-- What is percentage-based is the TIP SHARE. bar_settings.barback_tip_pct is a
-- 0-50% slider, and lib/payroll/tip-pool.ts routes the cut to whoever
-- classifyTipRole() calls a barback. So a barback today is paid
--
--   hourly wage  +  an equal share of (night's tips * barback_tip_pct)
--
-- THE CHANGE
--
-- Some bars pay their barbacks a flat hourly rate and keep the tip-out. This
-- column expresses that: 'hourly' means the wage is the whole arrangement and
-- the employee draws nothing from the pool. 'percentage' is what every existing
-- row does today.
--
-- WHY THE DEFAULT MATTERS
--
-- DEFAULT 'percentage' is what makes this migration safe on live payroll. Every
-- employee that already exists keeps drawing their tip share, and no pay run
-- that has already been reviewed changes value. The feature is opt-in per
-- employee, never a global switch — the same reasoning as hours_source
-- defaulting to 'pos' in 20260820000000.
--
-- WHY NOT REUSE tip_mode = 'no_tip'
--
-- 'no_tip' would mechanically exclude them from the pool and produce the right
-- number, but it records the wrong fact. It means "outside the tip arrangement"
-- and is used for security and managers, so payroll could no longer tell a
-- barback on an hourly deal apart from a doorman who was never in the pool.
-- Reporting has to show WHICH arrangement paid somebody, so the arrangement
-- needs its own column.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS pay_type TEXT NOT NULL DEFAULT 'percentage';

-- Written as a separate guarded block so re-running the migration on a database
-- that already has the constraint does not error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_pay_type_check'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_pay_type_check
      CHECK (pay_type IN ('percentage', 'hourly'));
  END IF;
END $$;

COMMENT ON COLUMN employees.pay_type IS
  'How the employee is compensated beyond their hourly wage. percentage (default) '
  'draws a share of the tip pool; hourly draws none. Only meaningful for barbacks '
  'today - bartenders are governed by tip_mode.';

-- Partial index: the interesting rows are the rare opt-ins, and payroll asks
-- "is anyone on this shift hourly" far more often than it scans the default.
CREATE INDEX IF NOT EXISTS idx_employees_pay_type_hourly
  ON employees (organization_id)
  WHERE pay_type = 'hourly';
