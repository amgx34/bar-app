/* ═════════════════════════════════════════════════════════════════════════════
   TwoTouchLocal — a faithful stand-in for the REAL 2TouchPOS schema.

   Every table and column below is copied name-for-name and type-for-type from a
   production TwoTouch database (schema script dated 04/2026). Only the fourteen
   relations the Rail profile touches are recreated, and only the columns it
   reads plus enough neighbours to keep each table recognisable.

   THIS IS THE ONE THAT MATTERS. 01-create-test-db.sql invents vwZReport /
   vwServerSales / vwItemAudit, which do not exist on any real box.
   04-create-unlike-schema.sql proves the scorer generalises. This one proves
   the agent works against the schema it will actually meet:

     • Hungarian notation everywhere — fNetAmt, dtmClaimDate, szDescription
     • item name and category reachable only through tblItem / tblCategory
     • line amounts in a separate RptCtg table, joined on uKeyID
     • the cash/credit tip split living in payments, by lPaymentType
     • a Daily/Hist pair for every sales table

   DESTRUCTIVE: drops and recreates the objects inside TwoTouchLocal.

   Run:  sqlcmd -S "lpc:(local)" -E -b -i 05-create-twotouch-schema.sql
   ═════════════════════════════════════════════════════════════════════════ */

IF DB_ID('TwoTouchLocal') IS NULL
    CREATE DATABASE TwoTouchLocal;
GO

USE TwoTouchLocal;
GO

DROP TABLE IF EXISTS dbo.tblSalesHdrHist;
DROP TABLE IF EXISTS dbo.tblSalesDailyHdr;
DROP TABLE IF EXISTS dbo.tblSalesHistPmnts;
DROP TABLE IF EXISTS dbo.tblSalesDailyPmnts;
DROP TABLE IF EXISTS dbo.tblSalesHist;
DROP TABLE IF EXISTS dbo.tblSalesHistRptCtg;
DROP TABLE IF EXISTS dbo.tblSalesDailyDtl;
DROP TABLE IF EXISTS dbo.tblSalesDailyRptCtg;
DROP TABLE IF EXISTS dbo.tblItem;
DROP TABLE IF EXISTS dbo.tblCategory;
DROP TABLE IF EXISTS dbo.tblTips;
DROP TABLE IF EXISTS dbo.tblTimeClockNew;
DROP TABLE IF EXISTS dbo.tblUserJobs;
DROP TABLE IF EXISTS dbo.tblUser;
GO

/* ── Ticket headers ──────────────────────────────────────────────────────────
   Note dtmTicketDate is smalldatetime in Hist and datetime in Daily. That is
   not a transcription slip — it is how the real database is built. */

CREATE TABLE dbo.tblSalesHdrHist (
    pkID           INT            NOT NULL,
    szTicketNo     NVARCHAR(20)   NOT NULL,
    fNetAmt        FLOAT          NOT NULL,
    fTaxAmt1       FLOAT          NULL,
    fTotIncTax     FLOAT          NULL,
    fTipAmt        FLOAT          NULL,
    dtmTicketDate  SMALLDATETIME  NULL,
    fkUserID       INT            NULL,
    fkTerminal     INT            NULL,
    szTicketType   NVARCHAR(1)    NULL,
    uKeyID         UNIQUEIDENTIFIER NOT NULL
);

CREATE TABLE dbo.tblSalesDailyHdr (
    pkID           INT IDENTITY(1,1) NOT NULL,
    szTicketNo     NVARCHAR(20)   NOT NULL,
    fNetAmt        FLOAT          NOT NULL,
    fTaxAmt1       FLOAT          NULL,
    fTotIncTax     FLOAT          NULL,
    fTipAmt        FLOAT          NULL,
    dtmTicketDate  DATETIME       NULL,
    fkUserID       INT            NOT NULL,
    fkTerminal     INT            NOT NULL,
    szTicketType   NVARCHAR(1)    NULL,
    uKeyID         UNIQUEIDENTIFIER NOT NULL
);

/* ── Payments — where the cash/credit tip split lives ────────────────────────
   lPaymentType: 0 = cash, 2 = credit payment, 7 = credit refund. Those
   constants are declared in the shipped fnFindMissingCCInvoices and
   TTsp_CashOnHand procedures. */

CREATE TABLE dbo.tblSalesHistPmnts (
    szTicketNo     NVARCHAR(50)   NOT NULL,
    lSortOrder     INT            NOT NULL,
    fAmount        FLOAT          NOT NULL,
    fTipAmt        FLOAT          NOT NULL,
    fCashPaidBack  FLOAT          NOT NULL,
    lPaymentType   INT            NOT NULL,
    fkUserID       INT            NOT NULL,
    fkTerminalID   INT            NOT NULL,
    dtmPmntDate    DATETIME       NOT NULL,
    uKeyID         UNIQUEIDENTIFIER NOT NULL
);

CREATE TABLE dbo.tblSalesDailyPmnts (
    szTicketNo     NVARCHAR(50)   NOT NULL,
    lSortOrder     INT            NOT NULL,
    fAmount        FLOAT          NOT NULL,
    fTipAmt        FLOAT          NOT NULL,
    fCashPaidBack  FLOAT          NOT NULL,
    lPaymentType   INT            NOT NULL,
    fkUserID       INT            NOT NULL,
    fkTerminalID   INT            NOT NULL,
    dtmPmntDate    DATETIME       NOT NULL,
    uKeyID         UNIQUEIDENTIFIER NOT NULL
);

/* ── Sale lines, and the amounts that go with them ───────────────────────────
   fkItemID is an INT: the item's NAME is not in this table. fQty is here, the
   money is in RptCtg, joined on uKeyID. This split is exactly why generic
   one-relation discovery cannot produce the Item Audit feed. */

CREATE TABLE dbo.tblSalesHist (
    pkID          INT            NOT NULL,
    szTicketNo    NVARCHAR(20)   NOT NULL,
    lTicketSort   INT            NOT NULL,
    fkItemID      INT            NULL,
    szModifier    NVARCHAR(110)  NULL,
    dtmSalesDate  SMALLDATETIME  NOT NULL,
    fkUserID      INT            NOT NULL,
    fQty          FLOAT          NULL,
    uKeyID        UNIQUEIDENTIFIER NULL,
    szRefundFlg   NVARCHAR(1)    NULL,
    szPLU         NVARCHAR(12)   NULL
);

CREATE TABLE dbo.tblSalesHistRptCtg (
    fNetAmt        FLOAT          NOT NULL,
    fGrossAmt      FLOAT          NOT NULL,
    blnUseGross    BIT            NOT NULL,
    lRptCategory   INT            NULL,
    fItemCost      FLOAT          NULL,
    fOrigSalesAmt  FLOAT          NULL,
    uKeyID         UNIQUEIDENTIFIER NOT NULL,
    pkID           INT            NOT NULL
);

CREATE TABLE dbo.tblSalesDailyDtl (
    pkID          INT IDENTITY(1,1) NOT NULL,
    szTicketNo    NVARCHAR(20)   NOT NULL,
    lTicketSort   INT            NOT NULL,
    fkItemID      INT            NULL,
    szModifier    NVARCHAR(110)  NULL,
    dtmSalesDate  DATETIME       NOT NULL,
    fkUserID      INT            NOT NULL,
    fQty          FLOAT          NULL,
    uKeyID        UNIQUEIDENTIFIER NULL,
    szRefundFlg   NVARCHAR(1)    NULL,
    szPLU         NVARCHAR(12)   NULL
);

CREATE TABLE dbo.tblSalesDailyRptCtg (
    fNetAmt        FLOAT          NOT NULL,
    fGrossAmt      FLOAT          NOT NULL,
    blnUseGross    BIT            NOT NULL,
    lRptCategory   INT            NULL,
    fItemCost      FLOAT          NULL,
    fOrigSalesAmt  FLOAT          NULL,
    uKeyID         UNIQUEIDENTIFIER NOT NULL,
    pkID           INT IDENTITY(1,1) NOT NULL
);

/* ── The item catalogue, where the names actually are ───────────────────────*/

CREATE TABLE dbo.tblCategory (
    pkID          INT IDENTITY(1,1) NOT NULL,
    szDescription NVARCHAR(25)   NOT NULL,
    szShortDesc   NVARCHAR(16)   NOT NULL,
    fkDepartment  INT            NOT NULL
);

CREATE TABLE dbo.tblItem (
    pkID          INT IDENTITY(1,1) NOT NULL,
    szDescription NVARCHAR(50)   NOT NULL,
    szShortDesc   NVARCHAR(30)   NULL,
    fkDepartment  INT            NOT NULL,
    fkCategory    INT            NOT NULL,
    fItemCost     FLOAT          NULL,
    szPLU         NVARCHAR(12)   NULL
);

/* ── Staff, jobs and the clock ───────────────────────────────────────────────
   The employee NAME is two tables away from the hours: tblTimeClockNew keys on
   fkUserJobID → tblUserJobs → tblUser. Sales and tips come from tblTips, 1:1
   with the clock row (tblTips.fkTimeClockID is UNIQUE on the real box). */

CREATE TABLE dbo.tblUser (
    pkID          INT IDENTITY(1,1) NOT NULL,
    szUserID      NVARCHAR(25)   NOT NULL,
    szFirstName   NVARCHAR(25)   NOT NULL,
    szLastName    NVARCHAR(25)   NOT NULL,
    fkEmpType     INT            NOT NULL,
    szEmpNumber   NVARCHAR(15)   NULL
);

CREATE TABLE dbo.tblUserJobs (
    pkID          INT IDENTITY(1,1) NOT NULL,
    fkUserID      INT            NULL,
    fkJobID       INT            NULL,
    blnPrimary    BIT            NULL,
    fPayRate      FLOAT          NULL,
    blnDisabled   BIT            NULL
);

CREATE TABLE dbo.tblTimeClockNew (
    pkID                 INT IDENTITY(1,1) NOT NULL,
    fkUserJobID          INT       NOT NULL,
    fPayRate             FLOAT     NOT NULL,
    dtmClockIn           DATETIME  NOT NULL,
    dtmReportIn          DATETIME  NULL,
    dtmClockOut          DATETIME  NULL,
    dtmReportOut         DATETIME  NULL,
    fHoursWorked         FLOAT     NULL,
    fOvertimePayRate     FLOAT     NULL,
    blnDeleted           BIT       NULL,
    fRegHoursWorked      FLOAT     NULL,
    fOverTimeHoursWorked FLOAT     NULL
);

CREATE TABLE dbo.tblTips (
    pkID           INT IDENTITY(1,1) NOT NULL,
    fkUserID       INT      NOT NULL,
    fTotalTips     FLOAT    NOT NULL,
    dtmClaimDate   DATETIME NOT NULL,
    blnZOut        BIT      NOT NULL,
    fkTimeClockID  INT      NULL,
    fTotalSales    FLOAT    NULL,
    fTipsCC        FLOAT    NULL,
    fTipsAutoGrat  FLOAT    NULL,
    fTipsCustAcct  FLOAT    NULL,
    fTipsCash      FLOAT    NULL,
    szTipType      CHAR(1)  NULL
);
GO

/* Indexes the profile's {cutoff} pushdown relies on, named as on the real box. */
CREATE NONCLUSTERED INDEX IX_tblSalesHist_2 ON dbo.tblSalesHist (dtmSalesDate);
CREATE NONCLUSTERED INDEX IX_tblSalesHdrHist_2 ON dbo.tblSalesHdrHist (dtmTicketDate);
GO

/* ═══ Seed ════════════════════════════════════════════════════════════════════
   Deliberately round numbers, so the integration tests can assert exact totals
   rather than "some rows came back".

   Per business day:
     Z Report   net sales 350.00  (200 + 100 in Hist, 50 in Daily)
                cc tips    30.00  (20 Hist + 10 Daily, payment types 2/7)
                cash tips   7.00  ( 5 Hist +  2 Daily, payment type 0)
     EW Report  2 employees, 8.00 regular + 1.50 overtime, 400 sales, 40 tips
     Item Audit 4 items, qty 10 and net 60.00 each
   ═══════════════════════════════════════════════════════════════════════════ */

SET NOCOUNT ON;

DECLARE @Days INT = 3;

DROP TABLE IF EXISTS #Days;
;WITH n AS (
    SELECT TOP (@Days) n = ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1
    FROM sys.all_objects
)
SELECT n.n, Dt = CAST(DATEADD(DAY, -n.n, GETDATE()) AS DATE)
INTO #Days
FROM n;

INSERT INTO dbo.tblCategory (szDescription, szShortDesc, fkDepartment) VALUES
    (N'Draft Beer', N'DRAFT', 1), (N'Liquor', N'LIQ', 1), (N'Food', N'FOOD', 2);

INSERT INTO dbo.tblItem (szDescription, szShortDesc, fkDepartment, fkCategory, fItemCost, szPLU) VALUES
    (N'House Lager',   N'LAGER',  1, 1, 1.80, N'1001'),
    (N'IPA Pint',      N'IPA',    1, 1, 2.10, N'1002'),
    (N'Well Vodka',    N'VODKA',  1, 2, 1.40, N'2001'),
    (N'Loaded Fries',  N'FRIES',  2, 3, 2.75, N'3001');

INSERT INTO dbo.tblUser (szUserID, szFirstName, szLastName, fkEmpType, szEmpNumber) VALUES
    (N'arivera', N'Alex', N'Rivera', 1, N'E001'),
    (N'sokafor', N'Sam',  N'Okafor', 1, N'E002');

INSERT INTO dbo.tblUserJobs (fkUserID, fkJobID, blnPrimary, fPayRate, blnDisabled)
SELECT pkID, 1, 1, 15.00, 0 FROM dbo.tblUser;

/* ── Z Report inputs ─────────────────────────────────────────────────────── */

INSERT INTO dbo.tblSalesHdrHist (pkID, szTicketNo, fNetAmt, fTaxAmt1, fTotIncTax, fTipAmt, dtmTicketDate, fkUserID, fkTerminal, uKeyID)
SELECT 1000 + (n * 10) + t.i,
       CONCAT('H', 1000 + (n * 10) + t.i),
       t.Amt, t.Amt * 0.08, t.Amt * 1.08, 0, Dt, 1, 1, NEWID()
FROM #Days
CROSS JOIN (VALUES (1, CAST(200.00 AS FLOAT)), (2, CAST(100.00 AS FLOAT))) AS t(i, Amt);

INSERT INTO dbo.tblSalesDailyHdr (szTicketNo, fNetAmt, fTaxAmt1, fTotIncTax, fTipAmt, dtmTicketDate, fkUserID, fkTerminal, uKeyID)
SELECT CONCAT('D', 2000 + n), 50.00, 4.00, 54.00, 0, Dt, 1, 1, NEWID() FROM #Days;

INSERT INTO dbo.tblSalesHistPmnts (szTicketNo, lSortOrder, fAmount, fTipAmt, fCashPaidBack, lPaymentType, fkUserID, fkTerminalID, dtmPmntDate, uKeyID)
SELECT CONCAT('H', 1000 + (n * 10) + t.i), 1, t.Amt, t.Tip, 0, t.PmtType, 1, 1, Dt, NEWID()
FROM #Days
CROSS JOIN (VALUES
    (1, CAST(200.00 AS FLOAT), CAST(20.00 AS FLOAT), 2),   -- credit payment
    (2, CAST(100.00 AS FLOAT), CAST( 5.00 AS FLOAT), 0)    -- cash
) AS t(i, Amt, Tip, PmtType);

INSERT INTO dbo.tblSalesDailyPmnts (szTicketNo, lSortOrder, fAmount, fTipAmt, fCashPaidBack, lPaymentType, fkUserID, fkTerminalID, dtmPmntDate, uKeyID)
SELECT CONCAT('D', 2000 + n), t.i, t.Amt, t.Tip, 0, t.PmtType, 1, 1, Dt, NEWID()
FROM #Days
CROSS JOIN (VALUES
    (1, CAST(30.00 AS FLOAT), CAST(10.00 AS FLOAT), 2),
    (2, CAST(20.00 AS FLOAT), CAST( 2.00 AS FLOAT), 0)
) AS t(i, Amt, Tip, PmtType);

/* ── EW Report inputs ────────────────────────────────────────────────────── */

INSERT INTO dbo.tblTimeClockNew
    (fkUserJobID, fPayRate, dtmClockIn, dtmReportIn, dtmClockOut, dtmReportOut,
     fHoursWorked, fOvertimePayRate, blnDeleted, fRegHoursWorked, fOverTimeHoursWorked)
SELECT uj.pkID, 15.00,
       DATEADD(HOUR, 16, CAST(Dt AS DATETIME)), DATEADD(HOUR, 16, CAST(Dt AS DATETIME)),
       DATEADD(HOUR, 25, CAST(Dt AS DATETIME)), DATEADD(HOUR, 25, CAST(Dt AS DATETIME)),
       9.50, 22.50, 0, 8.00, 1.50
FROM #Days
CROSS JOIN dbo.tblUserJobs uj;

/* A deleted clock row, which the profile must exclude. */
INSERT INTO dbo.tblTimeClockNew
    (fkUserJobID, fPayRate, dtmClockIn, dtmReportIn, blnDeleted, fRegHoursWorked, fOverTimeHoursWorked)
SELECT TOP 1 pkID, 15.00, GETDATE(), GETDATE(), 1, 99.00, 99.00 FROM dbo.tblUserJobs;

INSERT INTO dbo.tblTips
    (fkUserID, fTotalTips, dtmClaimDate, blnZOut, fkTimeClockID, fTotalSales, fTipsCC, fTipsAutoGrat, fTipsCustAcct, fTipsCash, szTipType)
SELECT uj.fkUserID, 40.00, tc.dtmReportIn, 1, tc.pkID, 400.00, 32.00, 0, 0, 8.00, 'D'
FROM dbo.tblTimeClockNew tc
JOIN dbo.tblUserJobs uj ON uj.pkID = tc.fkUserJobID
WHERE ISNULL(tc.blnDeleted, 0) = 0;

/* ── Item Audit inputs ───────────────────────────────────────────────────── */

DROP TABLE IF EXISTS #Lines;
CREATE TABLE #Lines (uKeyID UNIQUEIDENTIFIER, Dt DATE, fkItemID INT, Qty FLOAT, Net FLOAT, RefundFlg NVARCHAR(1), IsDaily BIT);

INSERT INTO #Lines (uKeyID, Dt, fkItemID, Qty, Net, RefundFlg, IsDaily)
SELECT NEWID(), d.Dt, i.pkID, 6.0, 36.00, NULL, 0 FROM #Days d CROSS JOIN dbo.tblItem i
UNION ALL
SELECT NEWID(), d.Dt, i.pkID, 4.0, 24.00, NULL, 1 FROM #Days d CROSS JOIN dbo.tblItem i;

/* A refunded line and a modifier line (no item), both of which must be excluded. */
INSERT INTO #Lines (uKeyID, Dt, fkItemID, Qty, Net, RefundFlg, IsDaily)
SELECT TOP 1 NEWID(), d.Dt, i.pkID, 99.0, 999.00, N'N', 0 FROM #Days d CROSS JOIN dbo.tblItem i;
INSERT INTO #Lines (uKeyID, Dt, fkItemID, Qty, Net, RefundFlg, IsDaily)
SELECT TOP 1 NEWID(), d.Dt, NULL, 99.0, 999.00, NULL, 0 FROM #Days d;

INSERT INTO dbo.tblSalesHist (pkID, szTicketNo, lTicketSort, fkItemID, dtmSalesDate, fkUserID, fQty, uKeyID, szRefundFlg, szPLU)
SELECT ROW_NUMBER() OVER (ORDER BY (SELECT NULL)), CONCAT('H', 1001), 1, fkItemID, Dt, 1, Qty, uKeyID, RefundFlg, NULL
FROM #Lines WHERE IsDaily = 0;

INSERT INTO dbo.tblSalesHistRptCtg (fNetAmt, fGrossAmt, blnUseGross, lRptCategory, fItemCost, fOrigSalesAmt, uKeyID, pkID)
SELECT Net, Net * 1.08, 0, 1, 2.00, Net, uKeyID, ROW_NUMBER() OVER (ORDER BY (SELECT NULL))
FROM #Lines WHERE IsDaily = 0;

INSERT INTO dbo.tblSalesDailyDtl (szTicketNo, lTicketSort, fkItemID, dtmSalesDate, fkUserID, fQty, uKeyID, szRefundFlg, szPLU)
SELECT CONCAT('D', 2001), 1, fkItemID, Dt, 1, Qty, uKeyID, RefundFlg, NULL
FROM #Lines WHERE IsDaily = 1;

INSERT INTO dbo.tblSalesDailyRptCtg (fNetAmt, fGrossAmt, blnUseGross, lRptCategory, fItemCost, fOrigSalesAmt, uKeyID)
SELECT Net, Net * 1.08, 0, 1, 2.00, Net, uKeyID
FROM #Lines WHERE IsDaily = 1;

DROP TABLE #Lines;
DROP TABLE #Days;
GO

SELECT 'tblSalesHdrHist'  AS Relation, COUNT(*) AS Rows FROM dbo.tblSalesHdrHist
UNION ALL SELECT 'tblSalesHistPmnts', COUNT(*) FROM dbo.tblSalesHistPmnts
UNION ALL SELECT 'tblSalesHist',      COUNT(*) FROM dbo.tblSalesHist
UNION ALL SELECT 'tblTimeClockNew',   COUNT(*) FROM dbo.tblTimeClockNew
UNION ALL SELECT 'tblTips',           COUNT(*) FROM dbo.tblTips;
GO
