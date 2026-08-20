-- Correct the sales-tax configuration for Scotty's On Vine.
--
-- Run in the Supabase SQL Editor. Ends in ROLLBACK, so the first run changes
-- nothing and shows you a before/after. Swap in COMMIT when it looks right.
--
--
-- WHY
-- ---
-- The Z report for 8/18/2026 reconciles exactly against what Rail stored:
--
--   Z SUBTOTAL   1446.34  =  z_report_days.total_sales   1446.34
--   Z Cash Sales  262.00  =  cash_sales                   262.00
--   Z Credit      1696.66 =  card_sales                  1696.66
--   Z Tips Paid    248.82 =  cc_tips                      248.82
--
-- So the agent is correct and nothing about the sales data needs repairing.
-- The settings describing that data are what is wrong:
--
--   1. pos_prices_include_tax = TRUE, but the Z adds tax ON TOP of the
--      subtotal (1446.34 + 112.56 tax = 1558.90 total). total_sales is
--      therefore tax-EXCLUSIVE, and the flag must be FALSE.
--
--      With it set to TRUE, lib/books/sales-tax.ts computes
--          net = 1446.34 / 1.0575 = 1367.70
--      removing tax that was never in the figure. Books has been understating
--      revenue by roughly $79 a night and reporting tax as 78.64 instead of
--      112.56.
--
--   2. sales_tax_rate = 5.75 is the OHIO STATE rate. Scotty's is at 2801 Short
--      Vine, Cincinnati — Hamilton County adds 2.05%, for a combined 7.8%.
--      The Z bears this out: 112.56 / 1446.34 = 7.78%, which is 7.8% after
--      per-ticket rounding across 208 transactions.
--
-- AFTER THIS, Books reports:
--      net revenue   1446.34   (the Z SUBTOTAL)
--      sales tax      112.81   (vs 112.56 actual -- rounding, see note below)
--      gross takings 1559.15   (the Z TOTAL, 1558.90)
--
-- NOT ADDRESSED HERE
-- ------------------
-- The Z also carries a "Transaction Fee" of 150.94 that Rail does not store
-- anywhere. If any of that is kept rather than passed to the processor, it is
-- missing from the P&L. That needs a schema change, not a settings fix.


BEGIN;

-- ── Before ───────────────────────────────────────────────────────────────────
SELECT
  'BEFORE' AS state,
  name,
  bar_settings ->> 'sales_tax_rate'          AS sales_tax_rate,
  bar_settings ->> 'pos_prices_include_tax'  AS pos_prices_include_tax,
  -- jsonb_object_keys() is set-returning; there is no *_count variant.
  (SELECT count(*) FROM jsonb_object_keys(bar_settings)) AS key_count
FROM organizations
WHERE id = 'dc899050-a024-47c1-bb61-d8a4a37ed1ee'::UUID;


-- ── The change ───────────────────────────────────────────────────────────────
--
-- `||` MERGES the two objects, replacing only these keys. Assigning a freshly
-- built object instead would drop the other eighteen settings on this bar --
-- hourly rates, tip split, NACHA details, bottle sizes.
UPDATE organizations
SET bar_settings = bar_settings || jsonb_build_object(
      'sales_tax_rate',         7.8,
      'pos_prices_include_tax', false
    )
WHERE id = 'dc899050-a024-47c1-bb61-d8a4a37ed1ee'::UUID;


-- ── After: must show 7.8 / false, and the SAME key count as before ──────────
SELECT
  'AFTER' AS state,
  name,
  bar_settings ->> 'sales_tax_rate'          AS sales_tax_rate,
  bar_settings ->> 'pos_prices_include_tax'  AS pos_prices_include_tax,
  (SELECT count(*) FROM jsonb_object_keys(bar_settings)) AS key_count,
  -- Reconciles against the 8/18 Z report: 1446.34 net -> 1558.90 total.
  ROUND(1446.34 * (1 + (bar_settings ->> 'sales_tax_rate')::NUMERIC / 100), 2)
                                             AS implied_gross_for_2026_08_18
FROM organizations
WHERE id = 'dc899050-a024-47c1-bb61-d8a4a37ed1ee'::UUID;


-- ============================================================================
--  Nothing is saved yet. Swap these two lines to apply:
--      -- ROLLBACK;
--      COMMIT;
-- ============================================================================

ROLLBACK;
-- COMMIT;
