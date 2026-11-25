-- Archive employees instead of deleting them.
--
-- A hard delete cascades to payroll_payouts, payroll_adjustments, employee_shifts,
-- direct_deposit_accounts and employee_accounts, so removing someone erased what
-- they were paid. The POS ingest also re-creates an unknown employee by name, so a
-- deleted employee came back as a blank pool employee on the next sync. The
-- employees table has no DELETE policy, which is why every delete was silently
-- refused; the answer is not to add one.
--
-- archived_at is NULL for active staff. Archived staff leave the roster, the setup
-- alerts and the add-to-shift list, but payroll, tax and withholding still see them
-- for any period in which they have shifts, payouts or adjustments.
--
-- No policy change: archiving is an UPDATE, which members can already do.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.employees.archived_at IS
  'NULL = active. Set when an owner or manager archives the employee; history is kept.';
