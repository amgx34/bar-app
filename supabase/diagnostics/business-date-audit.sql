-- ═══════════════════════════════════════════════════════════════════════════
-- Business-date audit — READ ONLY. Nothing here writes.
--
-- Runs in the Supabase SQL editor as-is. No parameters to fill in: every query
-- joins `organizations` and labels rows by bar name, so you can spot Scotty's
-- directly. (The previous version used psql `:'org_id'` variables, which the
-- Supabase editor does not support.)
--
-- Run each numbered block separately — the editor returns one result set.
--
-- ── Why the dates are wrong ────────────────────────────────────────────────
-- A bar open 17:00–03:00 trades across two calendar dates. Every ingest path
-- filed the post-midnight hours under the *following* day, so sales appear on
-- days the bar is closed.
--
-- The right backfill depends on which path fed the data, and the two differ:
--
--   Agent-fed (pos_provider = '2touch')  → SHAPE B, by construction.
--     The agent runs GROUP BY CAST(date AS DATE), so one session becomes TWO
--     rows: evening on day N, early hours on day N+1.
--     Fix = MERGE the day N+1 row into day N. A plain date shift would
--     collide with the existing day N row.
--
--   Manual Z upload (text / AI parser)   → SHAPE A.
--     One report per session, dated when the Z was printed (the morning
--     after). Fix = SHIFT report_date back one day.
--
-- Query 0 tells you which path this org is on. Query 4 tells you how many
-- rows would collide if you shifted — that number must be 0 before any shift.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 0. Which ingest path is each bar on? ───────────────────────────────────
-- Determines shape A vs B before anything else.
SELECT
  o.name                                            AS bar,
  o.pos_provider,
  (o.pos_config ? 'agent_token')                    AS has_agent_token,
  o.bar_settings ->> 'business_day_cutoff_hour'     AS configured_cutoff,
  (SELECT count(*) FROM z_report_days d WHERE d.organization_id = o.id) AS day_rows,
  (SELECT count(*) FROM z_reports    z WHERE z.organization_id = o.id) AS z_report_rows
FROM organizations o
ORDER BY o.name;


-- ── 1. Which weekdays show sales? ──────────────────────────────────────────
-- Confirms and sizes the symptom. z_report_days is the table the Tips page
-- reads, so this is what you are actually looking at in the UI.
SELECT
  o.name                                   AS bar,
  to_char(d.report_date, 'Dy')             AS weekday,
  count(*)                                 AS days_with_data,
  round(sum(d.total_sales)::numeric, 2)    AS total_sales,
  round(sum(d.cash_tips + d.cc_tips)::numeric, 2) AS total_tips,
  min(d.report_date)                       AS earliest,
  max(d.report_date)                       AS latest
FROM z_report_days d
JOIN organizations o ON o.id = d.organization_id
GROUP BY o.name, to_char(d.report_date, 'Dy'), extract(dow FROM d.report_date)
ORDER BY o.name, extract(dow FROM d.report_date);


-- ── 2. The suspect rows themselves ─────────────────────────────────────────
-- Every closed-day row, newest first, with the previous day beside it. If this
-- is shape B you will see a small early-hours total sitting next to a large
-- evening total on the day before.
--
-- EDIT: change 0 to whichever weekday the bar is closed
--       (0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat)
SELECT
  o.name                                    AS bar,
  d.report_date,
  to_char(d.report_date, 'Dy')              AS filed_as,
  round(d.total_sales::numeric, 2)          AS suspect_sales,
  round((d.cash_tips + d.cc_tips)::numeric, 2) AS suspect_tips,
  prev.report_date                          AS night_before,
  round(prev.total_sales::numeric, 2)       AS night_before_sales
FROM z_report_days d
JOIN organizations o   ON o.id = d.organization_id
LEFT JOIN z_report_days prev
       ON prev.organization_id = d.organization_id
      AND prev.report_date = d.report_date - 1
WHERE extract(dow FROM d.report_date) = 0     -- ← closed weekday
  AND d.total_sales > 0
ORDER BY o.name, d.report_date DESC
LIMIT 200;


-- ── 3. Ratio check — is the closed-day total a tail, or a full night? ──────
-- A spillover tail is normally a small fraction of the night before. A figure
-- comparable to the previous day suggests a whole session filed forward
-- (shape A) rather than a split (shape B).
SELECT
  o.name                                     AS bar,
  count(*)                                   AS closed_day_rows,
  round(avg(d.total_sales)::numeric, 2)      AS avg_closed_day_sales,
  round(avg(prev.total_sales)::numeric, 2)   AS avg_night_before_sales,
  round(
    (avg(d.total_sales) / nullif(avg(prev.total_sales), 0) * 100)::numeric, 1
  )                                          AS pct_of_night_before
FROM z_report_days d
JOIN organizations o ON o.id = d.organization_id
JOIN z_report_days prev
     ON prev.organization_id = d.organization_id
    AND prev.report_date = d.report_date - 1
WHERE extract(dow FROM d.report_date) = 0     -- ← closed weekday
  AND d.total_sales > 0
GROUP BY o.name
ORDER BY o.name;


-- ── 4. Collision check — MUST be 0 before any date shift ───────────────────
-- Every table below has UNIQUE(organization_id, report_date[, ...]). Shifting a
-- date onto a day that already has a row raises a unique violation, so this
-- count decides shift-vs-merge.
SELECT 'z_report_days' AS tbl, o.name AS bar, count(*) AS would_collide
FROM z_report_days d
JOIN organizations o ON o.id = d.organization_id
WHERE extract(dow FROM d.report_date) = 0
  AND EXISTS (
    SELECT 1 FROM z_report_days t
    WHERE t.organization_id = d.organization_id
      AND t.report_date = d.report_date - 1
  )
GROUP BY o.name

UNION ALL

SELECT 'z_report_server_tips', o.name, count(*)
FROM z_report_server_tips s
JOIN organizations o ON o.id = s.organization_id
WHERE extract(dow FROM s.report_date) = 0
  AND EXISTS (
    SELECT 1 FROM z_report_server_tips t
    WHERE t.organization_id  = s.organization_id
      AND t.report_date      = s.report_date - 1
      AND t.employee_name    = s.employee_name
  )
GROUP BY o.name

UNION ALL

SELECT 'z_reports', o.name, count(*)
FROM z_reports z
JOIN organizations o ON o.id = z.organization_id
WHERE extract(dow FROM z.report_date) = 0
  AND EXISTS (
    SELECT 1 FROM z_reports t
    WHERE t.organization_id = z.organization_id
      AND t.report_date     = z.report_date - 1
  )
GROUP BY o.name
ORDER BY tbl, bar;


-- ── 5. Everything a backfill has to move together ──────────────────────────
-- These tables all carry report_date and are read as one dataset. Any backfill
-- must move them in a single transaction or per-server tips desync from day
-- totals. employee_shifts is keyed on shift_date and is affected too.
SELECT 'z_report_days'        AS tbl, count(*) AS rows FROM z_report_days
UNION ALL SELECT 'z_reports',            count(*) FROM z_reports
UNION ALL SELECT 'z_report_server_tips', count(*) FROM z_report_server_tips
UNION ALL SELECT 'employee_shifts',      count(*) FROM employee_shifts
UNION ALL SELECT 'weigh_reports',        count(*) FROM weigh_reports
ORDER BY tbl;
