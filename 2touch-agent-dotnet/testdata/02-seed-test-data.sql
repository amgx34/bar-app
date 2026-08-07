/* ═════════════════════════════════════════════════════════════════════════════
   Seed TwoTouchTest with realistic bar traffic.

   Re-runnable: wipes and regenerates the whole window every time. Values are
   deterministic (derived from each date via CHECKSUM) so a re-seed reproduces
   the same numbers — a sync you ran yesterday stays comparable today.

   Change the window by editing @Days below.

   Run:  sqlcmd -S "lpc:(local)" -d TwoTouchTest -E -i 02-seed-test-data.sql
   ═════════════════════════════════════════════════════════════════════════ */

USE TwoTouchTest;
GO

SET NOCOUNT ON;

DECLARE @Days INT = 14;          -- ← how many days back to generate

DELETE FROM dbo.ZReportDay;
DELETE FROM dbo.ServerShift;
DELETE FROM dbo.ItemSale;

/* ── Day spine with a weekday/weekend sales curve ─────────────────────────── */

DROP TABLE IF EXISTS #Days;

;WITH n AS (
    SELECT TOP (@Days) n = ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1
    FROM sys.all_objects
)
SELECT
    n.n,
    Dt = CAST(DATEADD(DAY, -n.n, GETDATE()) AS DATE)
INTO #Days
FROM n;

ALTER TABLE #Days ADD Dow INT, NetSales DECIMAL(12,2);

/* 1900-01-01 was a Monday, so this is 0=Mon .. 4=Fri, 5=Sat, 6=Sun
   regardless of the server's DATEFIRST / language settings. */
UPDATE #Days SET Dow = DATEDIFF(DAY, '19000101', Dt) % 7;

UPDATE #Days
SET NetSales = CAST(
        (2400 + (ABS(CHECKSUM(CAST(Dt AS VARCHAR(10)), 'z')) % 800))   -- base
      * CASE Dow WHEN 4 THEN 1.65    -- Friday
                 WHEN 5 THEN 1.70    -- Saturday
                 WHEN 3 THEN 1.20    -- Thursday
                 WHEN 6 THEN 0.90    -- Sunday
                 ELSE 1.00 END
      AS DECIMAL(12,2));

/* ── Z Report: one row per terminal per day ──────────────────────────────────
   The agent SUMs across terminals, so the 55/45 split must reconcile. */

INSERT INTO dbo.ZReportDay (BusinessDate, TerminalId, NetSales, CreditCardTips, CashTips)
SELECT Dt, 1,
       CAST(NetSales * 0.55 AS DECIMAL(12,2)),
       CAST(NetSales * 0.55 * 0.18 * 0.80 AS DECIMAL(12,2)),   -- ~18% tips, 80% on card
       CAST(NetSales * 0.55 * 0.18 * 0.20 AS DECIMAL(12,2))
FROM #Days
UNION ALL
SELECT Dt, 2,
       CAST(NetSales * 0.45 AS DECIMAL(12,2)),
       CAST(NetSales * 0.45 * 0.18 * 0.80 AS DECIMAL(12,2)),
       CAST(NetSales * 0.45 * 0.18 * 0.20 AS DECIMAL(12,2))
FROM #Days;

/* ── Employee shifts ─────────────────────────────────────────────────────────
   Three servers split the day's sales; a barback works hours with NULL sales
   and NULL tips, which exercises the ISNULL() wrapping in SqlReader. */

DROP TABLE IF EXISTS #Staff;
CREATE TABLE #Staff (
    EmployeeName NVARCHAR(100),
    SalesShare   DECIMAL(5,4),   -- fraction of the day's net sales
    BaseHours    DECIMAL(6,2),
    IsServer     BIT
);

INSERT INTO #Staff (EmployeeName, SalesShare, BaseHours, IsServer) VALUES
    (N'Alex Rivera',   0.40, 7.50, 1),
    (N'Jamie Chen',    0.35, 7.00, 1),
    (N'Morgan Patel',  0.25, 6.00, 1),
    (N'Sam Okafor',    0.00, 5.50, 0);   -- barback: hours only

INSERT INTO dbo.ServerShift
    (WorkDate, EmployeeName, TotalSales, TipsPaidOut, RegularHours, OvertimeHours)
SELECT
    d.Dt,
    s.EmployeeName,
    CASE WHEN s.IsServer = 1
         THEN CAST(d.NetSales * s.SalesShare AS DECIMAL(12,2)) END,          -- NULL for barback
    CASE WHEN s.IsServer = 1
         THEN CAST(d.NetSales * s.SalesShare * 0.18 AS DECIMAL(12,2)) END,   -- NULL for barback
    /* Weekend shifts run longer; hours over 8 spill into overtime. */
    CAST(CASE WHEN d.Dow IN (4,5) THEN s.BaseHours + 1.5 ELSE s.BaseHours END AS DECIMAL(6,2)),
    CAST(CASE WHEN d.Dow IN (4,5) AND s.BaseHours + 1.5 > 8
              THEN s.BaseHours + 1.5 - 8 ELSE 0 END AS DECIMAL(6,2))
FROM #Days d
CROSS JOIN #Staff s;

/* ── Item audit ──────────────────────────────────────────────────────────── */

DROP TABLE IF EXISTS #Items;
CREATE TABLE #Items (
    ItemName     NVARCHAR(120),
    CategoryName NVARCHAR(80),
    UnitPrice    DECIMAL(10,2),
    PopWeight    DECIMAL(5,4)    -- share of the day's units
);

INSERT INTO #Items (ItemName, CategoryName, UnitPrice, PopWeight) VALUES
    (N'Draft IPA',           N'Draft Beer',     7.00, 0.16),
    (N'Draft Lager',         N'Draft Beer',     6.00, 0.14),
    (N'Bottled Domestic',    N'Bottled Beer',   5.00, 0.10),
    (N'House Red',           N'Wine',           9.00, 0.07),
    (N'House White',         N'Wine',           9.00, 0.06),
    (N'Old Fashioned',       N'Cocktails',     13.00, 0.11),
    (N'Margarita',           N'Cocktails',     12.00, 0.12),
    (N'Well Vodka',          N'Spirits',        8.00, 0.09),
    (N'Loaded Fries',        N'Food',          11.00, 0.09),
    (N'Wings (10pc)',        N'Food',          14.00, 0.04),
    (N'Soda',                N'N/A Beverages',  3.00, 0.02);

INSERT INTO dbo.ItemSale (SaleDate, ItemName, CategoryName, QuantitySold, NetSales)
SELECT
    d.Dt,
    i.ItemName,
    i.CategoryName,
    q.Qty,
    CAST(q.Qty * i.UnitPrice AS DECIMAL(12,2))
FROM #Days d
CROSS JOIN #Items i
CROSS APPLY (
    /* Units scale with the day's sales, nudged +/- a few by a per-item hash
       so the mix shifts day to day instead of being a flat multiple. */
    SELECT Qty = CAST(
        CEILING((d.NetSales / 9.0) * i.PopWeight)
      + (ABS(CHECKSUM(CAST(d.Dt AS VARCHAR(10)), i.ItemName)) % 7) - 3
      AS DECIMAL(10,2))
) q
WHERE q.Qty > 0;

/* ── Summary ─────────────────────────────────────────────────────────────── */

PRINT '--- Seeded TwoTouchTest ---';
SELECT
    Days           = (SELECT COUNT(DISTINCT CAST(BusinessDate AS DATE)) FROM dbo.ZReportDay),
    ZRows          = (SELECT COUNT(*) FROM dbo.ZReportDay),
    ShiftRows      = (SELECT COUNT(*) FROM dbo.ServerShift),
    ItemRows       = (SELECT COUNT(*) FROM dbo.ItemSale),
    TotalNetSales  = (SELECT SUM(NetSales) FROM dbo.ZReportDay),
    Earliest       = (SELECT MIN(CAST(BusinessDate AS DATE)) FROM dbo.ZReportDay),
    Latest         = (SELECT MAX(CAST(BusinessDate AS DATE)) FROM dbo.ZReportDay);
GO
