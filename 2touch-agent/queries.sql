-- ══════════════════════════════════════════════════════════════════════════════
-- 2TouchPOS data queries — run each block in SSMS to verify they return data.
-- Adjust table/column names to match your actual schema from discover-schema.sql
-- ══════════════════════════════════════════════════════════════════════════════

USE TwoTouch;

-- ── TEST 1: Z Report (daily sales totals) ─────────────────────────────────────
-- Common table names: vwZReport, ZReport, DailyTotals, ClosingReport
-- Try these until one returns data:

SELECT TOP 10 * FROM vwZReport            ORDER BY 1 DESC;  -- try this
-- SELECT TOP 10 * FROM ZReport           ORDER BY 1 DESC;
-- SELECT TOP 10 * FROM DailyTotals       ORDER BY 1 DESC;
-- SELECT TOP 10 * FROM ClosingReport     ORDER BY 1 DESC;
-- SELECT TOP 10 * FROM tblZReport        ORDER BY 1 DESC;

-- Once you find the right table, identify these columns:
--   date column    → maps to z_report_days.report_date
--   net sales      → maps to z_report_days.total_sales
--   CC tips        → maps to z_report_days.cc_tips
--   cash tips      → maps to z_report_days.cash_tips


-- ── TEST 2: Employee Worked (EW) Report ───────────────────────────────────────
-- Common names: vwServerSales, EmployeeWorkReport, ServerDailySales, EWReport

SELECT TOP 10 * FROM vwServerSales        ORDER BY 1 DESC;
-- SELECT TOP 10 * FROM EmployeeWorkReport ORDER BY 1 DESC;
-- SELECT TOP 10 * FROM ServerDailySales   ORDER BY 1 DESC;
-- SELECT TOP 10 * FROM tblEmployeeSales   ORDER BY 1 DESC;

-- Identify these columns:
--   date            → shift_date
--   employee name   → employee name to match/create
--   total sales     → (for tip rate calculation)
--   tips paid out   → z_report_server_tips.tips_paid_out
--   regular hours   → employee_shifts.regular_hours
--   overtime hours  → employee_shifts.overtime_hours


-- ── TEST 3: Item Audit Report ────────────────────────────────────────────────
-- Common names: vwItemAudit, ItemSales, ProductSales, MenuItemSales

SELECT TOP 10 * FROM vwItemAudit          ORDER BY 1 DESC;
-- SELECT TOP 10 * FROM ItemSales          ORDER BY 1 DESC;
-- SELECT TOP 10 * FROM ProductSales       ORDER BY 1 DESC;
-- SELECT TOP 10 * FROM tblItemAudit       ORDER BY 1 DESC;

-- Identify these columns:
--   item name     → inventory_items.name
--   category      → inventory_categories.name
--   quantity sold → (for usage tracking)
--   net sales     → (for revenue by category)
--   date          → for filtering by day


-- ── FINAL QUERIES (update table/column names after discovery) ─────────────────

-- Z Report — last 14 days
SELECT
    CAST(BusinessDate AS DATE)           AS report_date,
    SUM(NetSales)                        AS total_sales,
    SUM(CreditCardTips)                  AS cc_tips,
    SUM(CashTips)                        AS cash_tips
FROM vwZReport                           -- ← UPDATE table name
WHERE BusinessDate >= DATEADD(DAY, -14, GETDATE())
GROUP BY CAST(BusinessDate AS DATE)
ORDER BY report_date DESC;

-- EW Report — last 14 days
SELECT
    CAST(WorkDate AS DATE)               AS shift_date,
    EmployeeName                         AS employee_name,
    ISNULL(TotalSales, 0)                AS total_sales,
    ISNULL(TipsPaidOut, 0)               AS tips_paid_out,
    ISNULL(RegularHours, 0)              AS regular_hours,
    ISNULL(OvertimeHours, 0)             AS overtime_hours
FROM vwServerSales                       -- ← UPDATE table name
WHERE WorkDate >= DATEADD(DAY, -14, GETDATE())
ORDER BY shift_date DESC, employee_name;

-- Item Audit — last 14 days
SELECT
    CAST(SaleDate AS DATE)               AS sale_date,
    ItemName                             AS item_name,
    CategoryName                         AS category_name,
    SUM(QuantitySold)                    AS qty_sold,
    SUM(NetSales)                        AS net_sales
FROM vwItemAudit                         -- ← UPDATE table name
WHERE SaleDate >= DATEADD(DAY, -14, GETDATE())
GROUP BY CAST(SaleDate AS DATE), ItemName, CategoryName
ORDER BY sale_date DESC, net_sales DESC;
