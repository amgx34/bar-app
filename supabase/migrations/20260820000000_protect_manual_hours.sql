-- Stop the POS sync from reverting hours a manager corrected by hand.
--
-- THE BUG
--
-- app/api/2touch/ingest/route.ts writes shifts with a blind upsert:
--
--   .from('employee_shifts')
--   .upsert(rows, { onConflict: 'organization_id,employee_id,shift_date' })
--
-- The agent re-sends a rolling window (Sync.LookbackDays, default 2, and 14 on
-- some installs) every five minutes. So a correction made in Payroll -> Adjust
-- hours survives until the next sync and is then silently overwritten.
--
-- The payroll_adjustments row survives, which makes it worse than a plain loss:
-- the audit log states a change that the pay run no longer reflects, so the
-- figures and their own explanation disagree and neither looks wrong on its own.
--
-- It also undermined supabase/scripts/backfill-employee-hours.sql. Any date that
-- script writes inside the lookback window was reverted within minutes, so it
-- only ever "stuck" for dates older than the window.
--
-- THE FIX
--
-- The same shape the Z-report path already uses for cash tips, which had this
-- exact problem: 2Touch reports 0 cash tips for nearly every bar, so an
-- unguarded upsert erased a manager's jar count every night. That path marks the
-- row `cash_tips_source = 'manual'` and skips it on later syncs. Hours now do
-- the same.
--
-- Defaulting to 'pos' is what makes this safe for the rows that already exist:
-- every historical shift came from the POS or an import, none of them are
-- protected, and behaviour is unchanged until something explicitly marks a row.

ALTER TABLE employee_shifts
  ADD COLUMN IF NOT EXISTS hours_source TEXT NOT NULL DEFAULT 'pos';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_shifts_hours_source_valid'
  ) THEN
    ALTER TABLE employee_shifts
      ADD CONSTRAINT employee_shifts_hours_source_valid
      CHECK (hours_source IN ('pos', 'manual'));
  END IF;
END $$;

COMMENT ON COLUMN employee_shifts.hours_source IS
  'pos = the POS agent owns this row and may overwrite it. manual = a person '
  'corrected these hours; the 2Touch ingest must leave it alone. Cleared back '
  'to pos by the "revert to POS figures" action. Mirrors z_report_days.cash_tips_source.';

-- The ingest looks up protected rows for one org and one window of dates on
-- every sync, which is a five-minute loop on every install. Partial, because
-- the overwhelming majority of rows are 'pos' and never need finding.
CREATE INDEX IF NOT EXISTS idx_employee_shifts_manual
  ON employee_shifts(organization_id, shift_date)
  WHERE hours_source = 'manual';
