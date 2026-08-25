-- Tips with no wage behind them.
--
-- pay_type describes what an employee actually RECEIVES, and it has had two
-- corners since 20260821000000:
--
--   percentage  hourly wage + a share of the tip pool   (the default)
--   hourly      hourly wage, no tips
--
-- This adds the third, which is the mirror of 'hourly' rather than a new idea:
--
--   tips_only   a share of the tip pool, no wage
--
-- WHO IS ON IT
--
-- People who are not on the bar's payroll: a guest bartender behind the stick
-- for one night, a DJ or door contractor taking a cut of the night. Their hours
-- are still recorded and still matter, because both pools are split by hours
-- worked — the bar simply owes no wage for them.
--
-- WHY WIDENING THE CHECK IS SAFE
--
-- The DEFAULT is untouched, so every existing row keeps 'percentage' and no pay
-- run that has already been reviewed changes value. Widening a CHECK constraint
-- can never reject a row that already satisfied the narrower one.
--
-- lib/payroll/tip-pool.ts reads this column with normalizePayType(), which
-- resolves anything unrecognised to 'percentage'. So a database that has not
-- run this migration yet cannot be broken by application code that knows about
-- the new value — it simply pays the wage AND the tips until the constraint
-- catches up.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_pay_type_check'
  ) THEN
    ALTER TABLE employees DROP CONSTRAINT employees_pay_type_check;
  END IF;

  ALTER TABLE employees
    ADD CONSTRAINT employees_pay_type_check
    CHECK (pay_type IN ('percentage', 'hourly', 'tips_only'));
END $$;

COMMENT ON COLUMN employees.pay_type IS
  'What the employee receives. percentage (default) = hourly wage + a share of '
  'the tip pool; hourly = wage only, no tips; tips_only = a share of the tips '
  'with no wage, for people not on the bar''s payroll.';
