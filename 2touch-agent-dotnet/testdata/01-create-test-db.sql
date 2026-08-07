/* ═════════════════════════════════════════════════════════════════════════════
   TwoTouchTest — a stand-in for a real 2TouchPOS database.

   Creates base tables plus the three views the agent reads (vwZReport,
   vwServerSales, vwItemAudit) with the EXACT column names configured in
   appsettings.json → Agent:Columns. Nothing here touches a real TwoTouch DB.

   DESTRUCTIVE: drops and recreates the objects inside TwoTouchTest so schema
   edits always apply. Never point this at a production database.

   Run:  sqlcmd -S "lpc:(local)" -E -i 01-create-test-db.sql
   ═════════════════════════════════════════════════════════════════════════ */

IF DB_ID('TwoTouchTest') IS NULL
    CREATE DATABASE TwoTouchTest;
GO

USE TwoTouchTest;
GO

/* Views first — they depend on the tables. */
DROP VIEW  IF EXISTS dbo.vwZReport;
DROP VIEW  IF EXISTS dbo.vwServerSales;
DROP VIEW  IF EXISTS dbo.vwItemAudit;
GO

DROP TABLE IF EXISTS dbo.ZReportDay;
DROP TABLE IF EXISTS dbo.ServerShift;
DROP TABLE IF EXISTS dbo.ItemSale;
GO

/* ── Base tables ─────────────────────────────────────────────────────────────
   Shaped like the real thing: 2Touch stores one Z row per terminal per day,
   so the agent's GROUP BY genuinely has multiple rows to collapse. */

CREATE TABLE dbo.ZReportDay (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    BusinessDate   DATETIME      NOT NULL,
    TerminalId     INT           NOT NULL,
    NetSales       DECIMAL(12,2) NOT NULL,
    CreditCardTips DECIMAL(12,2) NOT NULL,
    CashTips       DECIMAL(12,2) NOT NULL
);

CREATE TABLE dbo.ServerShift (
    Id            INT IDENTITY(1,1) PRIMARY KEY,
    WorkDate      DATETIME      NOT NULL,
    EmployeeName  NVARCHAR(100) NOT NULL,
    TotalSales    DECIMAL(12,2) NULL,   -- NULLable on purpose: exercises ISNULL()
    TipsPaidOut   DECIMAL(12,2) NULL,
    RegularHours  DECIMAL(6,2)  NULL,
    OvertimeHours DECIMAL(6,2)  NULL
);

CREATE TABLE dbo.ItemSale (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    SaleDate     DATETIME      NOT NULL,
    ItemName     NVARCHAR(120) NOT NULL,
    CategoryName NVARCHAR(80)  NOT NULL,
    QuantitySold DECIMAL(10,2) NOT NULL,
    NetSales     DECIMAL(12,2) NOT NULL
);
GO

CREATE INDEX IX_ZReportDay_Date  ON dbo.ZReportDay(BusinessDate);
CREATE INDEX IX_ServerShift_Date ON dbo.ServerShift(WorkDate);
CREATE INDEX IX_ItemSale_Date    ON dbo.ItemSale(SaleDate);
GO

/* ── Views: the surface the agent actually queries ───────────────────────── */

CREATE VIEW dbo.vwZReport AS
    SELECT BusinessDate, NetSales, CreditCardTips, CashTips
    FROM dbo.ZReportDay;
GO

CREATE VIEW dbo.vwServerSales AS
    SELECT WorkDate, EmployeeName, TotalSales, TipsPaidOut, RegularHours, OvertimeHours
    FROM dbo.ServerShift;
GO

CREATE VIEW dbo.vwItemAudit AS
    SELECT SaleDate, ItemName, CategoryName, QuantitySold, NetSales
    FROM dbo.ItemSale;
GO

/* ── Read-only login ─────────────────────────────────────────────────────────
   Mirrors the BarAppRead login from ../../2touch-agent/2touchpart1.sql.
   Skipped automatically when the instance is Windows-auth-only, in which case
   the agent should run with "User": "" (Integrated auth) instead. */

IF SERVERPROPERTY('IsIntegratedSecurityOnly') = 1
BEGIN
    PRINT 'Instance is WINDOWS_ONLY auth - skipping BarAppRead login.';
    PRINT 'Use Integrated auth in appsettings.local.json:  "User": ""';
END
ELSE
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'BarAppRead')
        CREATE LOGIN BarAppRead WITH PASSWORD = 'TestP@ss123!',
                                     CHECK_POLICY = OFF,
                                     DEFAULT_DATABASE = TwoTouchTest;

    IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'BarAppRead')
        CREATE USER BarAppRead FOR LOGIN BarAppRead;

    ALTER ROLE db_datareader ADD MEMBER BarAppRead;   -- SELECT only, no writes
    PRINT 'Created read-only login BarAppRead (password: TestP@ss123!)';
END
GO

PRINT 'TwoTouchTest schema ready. Next: 02-seed-test-data.sql';
GO
