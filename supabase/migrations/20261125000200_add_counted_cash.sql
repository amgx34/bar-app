-- The cash a manager counted in the drawer at close, for the night tie-out.
--
-- NULL = nobody has counted. Not zero: a zero is a real count of an empty
-- drawer. Written only by the tie-out screen (owner and manager); no POS writer
-- touches it, so the agent's rolling re-send cannot erase it.
ALTER TABLE z_report_days
  ADD COLUMN IF NOT EXISTS counted_cash NUMERIC(12,2);

COMMENT ON COLUMN z_report_days.counted_cash IS
  'Cash counted in the drawer at close, entered by a person. NULL means not counted.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'z_report_days_counted_cash_sane'
  ) THEN
    ALTER TABLE z_report_days
      ADD CONSTRAINT z_report_days_counted_cash_sane
      CHECK (counted_cash IS NULL OR counted_cash BETWEEN 0 AND 1000000);
  END IF;
END $$;
