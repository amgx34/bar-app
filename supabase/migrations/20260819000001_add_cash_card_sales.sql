-- How the night's takings were tendered: cash vs card.
--
-- WHY IT MATTERS
--
-- z_report_days already records total_sales, and the tip split already treats
-- cash tips and card tips separately. What was missing is the same split on the
-- SALES, and a bar needs it for two ordinary reasons:
--
--   1. The drawer. Cash sales, less cash tips paid out of the drawer, is what
--      should be there at close. Without the figure the count cannot be checked
--      against anything.
--   2. The deposit. Card sales land in the bank on the processor's schedule;
--      cash lands when someone walks it to the bank. They are not the same money
--      on the same day, and the books treat them differently.
--
-- NULL vs ZERO
--
-- Both columns are nullable with no default, and that distinction carries the
-- whole meaning of the feature:
--
--   NULL = the POS did not report the split. Older rows, an agent that has not
--          been re-run through setup, or an email-imported Z report.
--   0    = the POS reported the split and it really was zero. A card-only night.
--
-- Defaulting to 0 would quietly claim every historical night took no cash. The
-- UI reads NULL as "not reported" and shows nothing rather than a false zero.

ALTER TABLE z_report_days
  ADD COLUMN IF NOT EXISTS cash_sales NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS card_sales NUMERIC(12,2);

COMMENT ON COLUMN z_report_days.cash_sales IS
  'Sales tendered in cash, net of change given back. NULL means the POS did not '
  'report the split — not that the night took no cash.';

COMMENT ON COLUMN z_report_days.card_sales IS
  'Sales tendered on a card. NULL means the POS did not report the split.';

-- Negatives are possible in principle (a day of refunds outweighing takings) so
-- they are not blocked. What is blocked is a figure that cannot be money.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'z_report_days_tender_sane'
  ) THEN
    ALTER TABLE z_report_days
      ADD CONSTRAINT z_report_days_tender_sane
      CHECK (
        (cash_sales IS NULL OR cash_sales BETWEEN -1000000 AND 1000000) AND
        (card_sales IS NULL OR card_sales BETWEEN -1000000 AND 1000000)
      );
  END IF;
END $$;

-- ── Who counted the cash tips ────────────────────────────────────────────────
--
-- A COLLISION, not a nicety.
--
-- z_report_days.cash_tips can now be written from two places: the agent's Z
-- feed, and a manager typing the jar count at close (app/(app)/app/payroll/
-- cash-actions.ts). The agent re-sends a rolling two-day window every five
-- minutes and upserts it. 2Touch has a cash-tip field but almost nobody rings
-- tips into it, so what the agent sends is nearly always 0.
--
-- Without provenance the sequence is: manager counts $240 at 1:05am, agent
-- syncs at 1:10am, the figure is 0 again, and the split is wrong for the rest
-- of the night. The manager has no way to tell it happened.
--
-- So: a row marked 'manual' keeps its cash_tips through every subsequent sync.
-- A human who counted a jar outranks a POS field nobody fills in. Re-entering
-- the figure is the only thing that changes it — and re-entering is exactly
-- what someone correcting a miscount would do.

ALTER TABLE z_report_days
  ADD COLUMN IF NOT EXISTS cash_tips_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'z_report_days_cash_tips_source_check'
  ) THEN
    ALTER TABLE z_report_days
      ADD CONSTRAINT z_report_days_cash_tips_source_check
      CHECK (cash_tips_source IS NULL OR cash_tips_source IN ('pos', 'manual'));
  END IF;
END $$;

COMMENT ON COLUMN z_report_days.cash_tips_source IS
  'manual = counted and entered by a person; the POS sync must not overwrite '
  'cash_tips on this row. pos/NULL = whatever the feed last reported.';
