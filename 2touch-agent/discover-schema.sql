-- ══════════════════════════════════════════════════════════════════════════════
-- 2TouchPOS schema discovery — run this in SSMS against the TwoTouch database
-- to find the exact table/view names for Z Reports, EW Reports, Item Audit
-- ══════════════════════════════════════════════════════════════════════════════

USE TwoTouch;

-- 1. All tables and views in the database
SELECT
    TABLE_SCHEMA,
    TABLE_NAME,
    TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
ORDER BY TABLE_TYPE, TABLE_NAME;

-- 2. Tables/views that look like Z reports or daily sales
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME LIKE '%Z%'
   OR TABLE_NAME LIKE '%Report%'
   OR TABLE_NAME LIKE '%Daily%'
   OR TABLE_NAME LIKE '%Sales%'
   OR TABLE_NAME LIKE '%Closing%'
ORDER BY TABLE_NAME;

-- 3. Tables/views that look like employee / shift data
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME LIKE '%Employee%'
   OR TABLE_NAME LIKE '%Server%'
   OR TABLE_NAME LIKE '%Shift%'
   OR TABLE_NAME LIKE '%Work%'
   OR TABLE_NAME LIKE '%Labor%'
ORDER BY TABLE_NAME;

-- 4. Tables/views that look like item / inventory / audit data
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME LIKE '%Item%'
   OR TABLE_NAME LIKE '%Product%'
   OR TABLE_NAME LIKE '%Audit%'
   OR TABLE_NAME LIKE '%Menu%'
   OR TABLE_NAME LIKE '%Inventory%'
ORDER BY TABLE_NAME;

-- 5. Check column names across all tables for date/sales columns
--    (helps identify which tables contain the data we want)
SELECT
    t.TABLE_NAME,
    c.COLUMN_NAME,
    c.DATA_TYPE
FROM INFORMATION_SCHEMA.TABLES t
JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME
WHERE c.COLUMN_NAME LIKE '%Date%'
   OR c.COLUMN_NAME LIKE '%Sales%'
   OR c.COLUMN_NAME LIKE '%Tip%'
   OR c.COLUMN_NAME LIKE '%Tax%'
ORDER BY t.TABLE_NAME, c.COLUMN_NAME;
