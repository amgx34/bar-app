-- supabase/migrations/20261014000000_add_employee_tax_fields.sql
--
-- Classification and W-4 data for payroll withholding.
--
-- Every column is nullable, so every existing employee row stays valid. A NULL
-- tax_classification means UNCLASSIFIED — a question nobody has answered — and
-- is deliberately not the same as 'contractor_1099', which is a decision
-- somebody made. Payroll reports the two differently.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS tax_classification   TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w4_filing_status     TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w4_multiple_jobs     BOOLEAN;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w4_dependents_amount NUMERIC(10,2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w4_other_income      NUMERIC(10,2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w4_deductions        NUMERIC(10,2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w4_extra_withholding NUMERIC(10,2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS w4_exempt            BOOLEAN;

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_tax_classification_check;
ALTER TABLE employees ADD CONSTRAINT employees_tax_classification_check
  CHECK (tax_classification IS NULL OR tax_classification IN ('w2', 'contractor_1099'));

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_w4_filing_status_check;
ALTER TABLE employees ADD CONSTRAINT employees_w4_filing_status_check
  CHECK (w4_filing_status IS NULL OR w4_filing_status IN
    ('single', 'married_jointly', 'head_of_household'));
