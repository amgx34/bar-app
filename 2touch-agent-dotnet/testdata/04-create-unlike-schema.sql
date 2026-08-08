/* ═════════════════════════════════════════════════════════════════════════════
   TwoTouchOdd — the same bar data under names the agent has never seen.

   WHY A SEPARATE DATABASE. Schema discovery tested against TwoTouchTest would
   pass trivially: vwZReport / vwServerSales / vwItemAudit are already the
   configured defaults, and their columns are the configured column names. The
   scorer would be graded on recognising the answer it was written from.

   Here nothing matches by name. tblDayClose, EmpWorkSummary and ItemSalesAudit
   carry the same figures under plausible-but-different column names, plus a
   few decoy relations to rank against. If the wizard maps all three feeds here
   without the operator overriding a column, discovery genuinely works.

   DESTRUCTIVE: drops and recreates the objects inside TwoTouchOdd.

   Run:  sqlcmd -S "lpc:(local)" -E -b -i 04-create-unlike-schema.sql
   ═════════════════════════════════════════════════════════════════════════ */

IF DB_ID('TwoTouchOdd') IS NULL
    CREATE DATABASE TwoTouchOdd;
GO

USE TwoTouchOdd;
GO

DROP TABLE IF EXISTS dbo.tblDayClose;
DROP TABLE IF EXISTS dbo.EmpWorkSummary;
DROP TABLE IF EXISTS dbo.ItemSalesAudit;
DROP TABLE IF EXISTS dbo.TerminalPing;
DROP TABLE IF EXISTS dbo.ItemPriceHistory;
DROP TABLE IF EXISTS dbo.ShiftNotes;
GO

/* ── The three feeds, renamed ────────────────────────────────────────────────
   Column types matter as much as names: the scorer disqualifies a relation
   whose date or amount column is the wrong type, so these are deliberately
   the right types under the wrong names. */

CREATE TABLE dbo.tblDayClose (
    Id          INT IDENTITY(1,1) PRIMARY KEY,
    CloseDate   DATETIME      NOT NULL,   -- ← Z Report date
    RegisterNo  INT           NOT NULL,
    NetSales    MONEY         NOT NULL,   -- ← net sales
    ChargeTips  MONEY         NOT NULL,   -- ← credit-card tips
    CashTips    MONEY         NOT NULL    -- ← cash tips
);

CREATE TABLE dbo.EmpWorkSummary (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    ShiftDate    DATETIME      NOT NULL,  -- ← EW date
    StaffName    NVARCHAR(100) NOT NULL,  -- ← employee name
    ServerSales  MONEY         NULL,      -- ← total sales
    TipsPaid     MONEY         NULL,      -- ← tips paid out
    HoursWorked  DECIMAL(6,2)  NULL,      -- ← regular hours
    OvertimeHrs  DECIMAL(6,2)  NULL       -- ← overtime hours
);

CREATE TABLE dbo.ItemSalesAudit (
    Id            INT IDENTITY(1,1) PRIMARY KEY,
    TranDate      DATETIME      NOT NULL, -- ← item audit date
    MenuItemName  NVARCHAR(120) NOT NULL, -- ← item name
    MajorGroup    NVARCHAR(80)  NOT NULL, -- ← category
    UnitsSold     DECIMAL(10,2) NOT NULL, -- ← quantity sold
    ExtendedPrice MONEY         NOT NULL  -- ← net sales
);

/* ── Decoys ──────────────────────────────────────────────────────────────────
   Real databases are full of relations that share keywords with a feed but
   cannot supply it. Each of these must be dropped or out-ranked. */

-- Has "item" in the name and a date, but every amount is text.
CREATE TABLE dbo.ItemPriceHistory (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    EffectiveDate DATETIME     NOT NULL,
    MenuItemName NVARCHAR(120) NOT NULL,
    MajorGroup   NVARCHAR(80)  NOT NULL,
    UnitsSold    NVARCHAR(20)  NOT NULL,   -- nvarchar → disqualifying
    ExtendedPrice NVARCHAR(20) NOT NULL    -- nvarchar → disqualifying
);

-- Looks like a Z report by name, but the date is stored as text.
CREATE TABLE dbo.TerminalPing (
    Id         INT IDENTITY(1,1) PRIMARY KEY,
    ReportDate NVARCHAR(10)  NOT NULL,     -- nvarchar → disqualifying
    NetSales   MONEY         NOT NULL,
    ChargeTips MONEY         NOT NULL,
    CashTips   MONEY         NOT NULL
);

-- Shift-shaped, but carries no numbers at all.
CREATE TABLE dbo.ShiftNotes (
    Id        INT IDENTITY(1,1) PRIMARY KEY,
    ShiftDate DATETIME      NOT NULL,
    StaffName NVARCHAR(100) NOT NULL,
    Note      NVARCHAR(400) NULL
);
GO

SET NOCOUNT ON;

DECLARE @Days INT = 14;

/* Same deterministic curve as 02-seed-test-data.sql, so the two databases can
   be compared row for row after a sync. */

DROP TABLE IF EXISTS #Days;

;WITH n AS (
    SELECT TOP (@Days) n = ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1
    FROM sys.all_objects
)
SELECT n.n, Dt = CAST(DATEADD(DAY, -n.n, GETDATE()) AS DATE)
INTO #Days
FROM n;

ALTER TABLE #Days ADD Dow INT, NetSales DECIMAL(12,2);

UPDATE #Days SET Dow = DATEDIFF(DAY, '19000101', Dt) % 7;

UPDATE #Days
SET NetSales = CAST(
        (2400 + (ABS(CHECKSUM(CAST(Dt AS VARCHAR(10)), 'z')) % 800))
      * CASE Dow WHEN 4 THEN 1.65
                 WHEN 5 THEN 1.70
                 WHEN 3 THEN 1.20
                 WHEN 6 THEN 0.90
                 ELSE 1.00 END
      AS DECIMAL(12,2));

/* Two registers per day, so the agent's GROUP BY has something to collapse. */
INSERT INTO dbo.tblDayClose (CloseDate, RegisterNo, NetSales, ChargeTips, CashTips)
SELECT Dt, 1,
       CAST(NetSales * 0.55 AS DECIMAL(12,2)),
       CAST(NetSales * 0.55 * 0.18 * 0.80 AS DECIMAL(12,2)),
       CAST(NetSales * 0.55 * 0.18 * 0.20 AS DECIMAL(12,2))
FROM #Days
UNION ALL
SELECT Dt, 2,
       CAST(NetSales * 0.45 AS DECIMAL(12,2)),
       CAST(NetSales * 0.45 * 0.18 * 0.80 AS DECIMAL(12,2)),
       CAST(NetSales * 0.45 * 0.18 * 0.20 AS DECIMAL(12,2))
FROM #Days;

INSERT INTO dbo.EmpWorkSummary (ShiftDate, StaffName, ServerSales, TipsPaid, HoursWorked, OvertimeHrs)
SELECT d.Dt, s.StaffName,
       CAST(d.NetSales * s.Share AS DECIMAL(12,2)),
       CAST(d.NetSales * s.Share * 0.18 * 0.20 AS DECIMAL(12,2)),
       s.Hours,
       CASE WHEN s.Hours > 8 THEN s.Hours - 8 ELSE 0 END
FROM #Days d
CROSS JOIN (VALUES
    (N'Alex Rivera',   0.34, CAST(8.50 AS DECIMAL(6,2))),
    (N'Sam Okafor',    0.28, CAST(7.75 AS DECIMAL(6,2))),
    (N'Jordan Blake',  0.22, CAST(6.00 AS DECIMAL(6,2))),
    (N'Casey Nguyen',  0.16, CAST(5.25 AS DECIMAL(6,2)))
) AS s(StaffName, Share, Hours);

INSERT INTO dbo.ItemSalesAudit (TranDate, MenuItemName, MajorGroup, UnitsSold, ExtendedPrice)
SELECT d.Dt, i.MenuItemName, i.MajorGroup,
       CAST(4 + (ABS(CHECKSUM(CAST(d.Dt AS VARCHAR(10)), i.MenuItemName)) % 30) AS DECIMAL(10,2)),
       CAST((4 + (ABS(CHECKSUM(CAST(d.Dt AS VARCHAR(10)), i.MenuItemName)) % 30)) * i.Price AS DECIMAL(12,2))
FROM #Days d
CROSS JOIN (VALUES
    (N'House Lager',      N'Draft Beer',  CAST(6.00  AS DECIMAL(8,2))),
    (N'IPA Pint',         N'Draft Beer',  CAST(7.50  AS DECIMAL(8,2))),
    (N'Well Vodka',       N'Liquor',      CAST(8.00  AS DECIMAL(8,2))),
    (N'Old Fashioned',    N'Cocktails',   CAST(13.00 AS DECIMAL(8,2))),
    (N'House Red Glass',  N'Wine',        CAST(11.00 AS DECIMAL(8,2))),
    (N'Loaded Fries',     N'Food',        CAST(9.50  AS DECIMAL(8,2)))
) AS i(MenuItemName, MajorGroup, Price);

/* Decoy rows, so the relations are not trivially empty. */
INSERT INTO dbo.TerminalPing (ReportDate, NetSales, ChargeTips, CashTips)
SELECT CONVERT(NVARCHAR(10), Dt, 23), 0, 0, 0 FROM #Days;

INSERT INTO dbo.ItemPriceHistory (EffectiveDate, MenuItemName, MajorGroup, UnitsSold, ExtendedPrice)
SELECT Dt, N'House Lager', N'Draft Beer', N'0', N'6.00' FROM #Days;

INSERT INTO dbo.ShiftNotes (ShiftDate, StaffName, Note)
SELECT Dt, N'Alex Rivera', N'Closed on time.' FROM #Days;

DROP TABLE #Days;
GO

SELECT 'tblDayClose'     AS Relation, COUNT(*) AS Rows FROM dbo.tblDayClose
UNION ALL SELECT 'EmpWorkSummary', COUNT(*) FROM dbo.EmpWorkSummary
UNION ALL SELECT 'ItemSalesAudit', COUNT(*) FROM dbo.ItemSalesAudit;
GO
