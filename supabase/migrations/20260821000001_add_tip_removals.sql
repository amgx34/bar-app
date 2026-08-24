-- Let tips be taken out of a night's pool and logged with a reason.
--
-- THE CASE
--
-- A court-ordered payout, a garnishment, or any tips legally required to be
-- handed over in cash. The money leaves the pool, so it must not be split
-- between the bartenders, and months later somebody has to be able to say why
-- that night paid less than the Z report shows.
--
-- WHY NO NEW TABLE
--
-- payroll_adjustments already is the log: it has shift_date, amount, reason,
-- created_by and created_at, it is already org-scoped and indexed by date, and
-- the payroll screen already reads it to show the audit trail. A separate
-- tip_removals table would duplicate all of that and give the pay run a second
-- place to look for money that moved.
--
-- So this migration adds no storage. It widens one CHECK and relaxes one
-- NOT NULL.
--
-- WHY employee_id BECOMES NULLABLE
--
-- A transfer and an hours correction are always about a person. A removal is
-- not: the pool itself shrank. Sometimes the cash goes to a named employee and
-- recording that is useful, but requiring it would force whoever enters a
-- garnishment to attribute it to somebody arbitrary, and that fabricated
-- attribution is exactly what an audit trail must not contain.
--
-- The partial CHECK below keeps the old rows honest: 'hours' and 'tip_transfer'
-- still require an employee, so relaxing the column cannot weaken them.

-- 1. Allow the new kind.
ALTER TABLE payroll_adjustments
  DROP CONSTRAINT IF EXISTS payroll_adjustments_kind_check;

ALTER TABLE payroll_adjustments
  ADD CONSTRAINT payroll_adjustments_kind_check
  CHECK (kind IN ('hours', 'tip_transfer', 'tip_removal'));

-- 2. A removal need not name a person.
ALTER TABLE payroll_adjustments
  ALTER COLUMN employee_id DROP NOT NULL;

-- 3. Keep the existing kinds exactly as strict as they were.
ALTER TABLE payroll_adjustments
  DROP CONSTRAINT IF EXISTS payroll_adjustments_employee_required;

ALTER TABLE payroll_adjustments
  ADD CONSTRAINT payroll_adjustments_employee_required
  CHECK (kind = 'tip_removal' OR employee_id IS NOT NULL);

-- 4. A removal is meaningless without a positive amount. Cheap to enforce here,
--    and it stops a null slipping through and being read as "remove nothing"
--    by one caller and "remove everything" by another.
ALTER TABLE payroll_adjustments
  DROP CONSTRAINT IF EXISTS payroll_adjustments_removal_amount;

ALTER TABLE payroll_adjustments
  ADD CONSTRAINT payroll_adjustments_removal_amount
  CHECK (kind <> 'tip_removal' OR (amount IS NOT NULL AND amount > 0));

COMMENT ON COLUMN payroll_adjustments.employee_id IS
  'Who the adjustment concerns. NULL only for kind = tip_removal, where the pool '
  'shrank rather than one person''s share.';
