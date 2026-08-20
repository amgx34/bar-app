-- ============================================================================
--  BACKFILL EMPLOYEE SHIFT HOURS
--  Overwrite recorded hours for specific people on specific dates.
-- ============================================================================
--
--  WHAT THIS IS FOR
--  ----------------
--  Sometimes a week of hours in Rail is wrong and cannot practically be fixed
--  through the app: the POS agent was down, a clock-in device was misconfigured,
--  or a fortnight was imported against the wrong dates. You have the correct
--  figures written down somewhere. This script puts them in.
--
--  It does exactly what the "Adjust hours" button in Payroll does, just in bulk:
--    1. it overwrites employee_shifts.regular_hours / overtime_hours, and
--    2. it writes a payroll_adjustments row for every change, recording what the
--       figure WAS, what it BECAME, and why.
--
--  Step 2 is not optional bookkeeping. If somebody asks in three weeks why their
--  cheque changed, that log is the only thing that can answer them.
--
--
--  HOW TO RUN IT  (read this whole section before you start)
--  ---------------------------------------------------------
--  1. Open the Supabase dashboard -> SQL Editor -> New query.
--  2. Paste this entire file in.
--  3. Edit ONLY the block marked "EDIT ME" below. Nothing else needs changing.
--  4. Press Run. NOTHING IS SAVED YET. You will get three result tables:
--       - a check that every employee name was found,
--       - a preview of before -> after for every row,
--       - a summary count.
--  5. READ THE PREVIEW. Confirm the names, dates and hours are what you expect.
--  6. If it is right: find the two lines at the very bottom that say
--         ROLLBACK;
--         -- COMMIT;
--     and swap which one is commented out, so they read
--         -- ROLLBACK;
--         COMMIT;
--     then press Run again. That is what actually saves it.
--  7. If it is wrong: change the EDIT ME block and run again. Nothing was saved,
--     so there is nothing to undo.
--
--  The script runs inside a transaction that ROLLS BACK by default. You have to
--  deliberately swap in COMMIT to make any change stick. This is on purpose: a
--  script that overwrites wages should not be one keystroke away from running.
--
--
--  SAFETY RULES BUILT IN
--  ---------------------
--  * Every statement is scoped to one organization_id. Rail is multi-tenant and
--    a query without that filter would reach into another bar's payroll.
--  * If an employee name matches zero people, or more than one, the script stops
--    with an error rather than guessing which one you meant.
--  * If the organization id does not exist, it stops.
--  * Hours outside 0-24 are rejected. A mistyped "80" is a week's wages.
--  * Missing shifts are CREATED, not skipped. Somebody who never clocked in has
--    no row at all, and that is exactly when a backfill is needed.
--
--
--  TWO THINGS WORTH KNOWING
--  ------------------------
--  * The payroll_adjustments rows this writes are a RECORD, not an instruction.
--    Payroll re-applies adjustments of kind 'tip_transfer' when it runs, but it
--    reads hours straight off employee_shifts and ignores 'hours' rows. So the
--    log and the overwrite below do not double up -- one is the evidence, the
--    other is the change.
--
--  * Run this in the Supabase SQL Editor, which connects as a superuser and so
--    bypasses row-level security. Running it through a normal client key will
--    fail: employee_shifts allows member writes, but payroll_adjustments is
--    deliberately read-only to everyone, because an audit row the audited party
--    can edit is not evidence of anything.
--
-- ============================================================================


BEGIN;


-- ============================================================================
--  EDIT ME  ---  everything you need to change is in this one block.
-- ============================================================================
--
--  Replace the organization id with your bar's, then list one row per person
--  per date. Copy the example rows and edit them.
--
--  Column meanings:
--    employee_name   Their name as it appears in Rail, spelled exactly.
--                    Case does not matter; surrounding spaces do not matter.
--    shift_date      The night worked, as 'YYYY-MM-DD'.
--    regular_hours   Correct regular hours for that night. Use 0 if none.
--    overtime_hours  Correct overtime hours for that night. Use 0 if none.
--    reason          Why you are changing it. This is shown to managers later,
--                    so write something a human can act on. Not "fix".
--
--  Leave the trailing comma off the LAST row only.
--
CREATE TEMP TABLE _backfill_input (
  employee_name   TEXT,
  shift_date      DATE,
  regular_hours   NUMERIC(5,2),
  overtime_hours  NUMERIC(5,2),
  reason          TEXT
) ON COMMIT DROP;


-- >>> PUT YOUR BAR'S ORGANIZATION ID HERE <<<
--     Find it in the app URL, or ask whoever set up the account.
CREATE TEMP TABLE _backfill_org ON COMMIT DROP AS
SELECT '00000000-0000-0000-0000-000000000000'::UUID AS organization_id;


-- >>> PUT YOUR CORRECTED HOURS HERE <<<
INSERT INTO _backfill_input (employee_name, shift_date, regular_hours, overtime_hours, reason) VALUES
  ('Dana Whitfield',  '2026-08-04',  8.00,  0.00,  'Agent offline 4-9 Aug; hours taken from the paper sign-in sheet'),
  ('Dana Whitfield',  '2026-08-05',  7.50,  0.00,  'Agent offline 4-9 Aug; hours taken from the paper sign-in sheet'),
  ('Marcus Reyes',    '2026-08-04',  9.00,  1.25,  'Agent offline 4-9 Aug; hours taken from the paper sign-in sheet'),
  ('Marcus Reyes',    '2026-08-06',  6.00,  0.00,  'Agent offline 4-9 Aug; hours taken from the paper sign-in sheet')
;


-- >>> WHO IS MAKING THIS CHANGE? <<<
--  Optional. Paste the auth user id of the manager running this so the log names
--  them. Leave it as NULL if you do not have it -- the reason and timestamp are
--  still recorded, which is the part that matters.
CREATE TEMP TABLE _backfill_author ON COMMIT DROP AS
SELECT NULL::UUID AS created_by;


-- ============================================================================
--  STOP EDITING.  Everything below is checks, preview, and the write itself.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  CHECK 1: does the organization exist?
-- ----------------------------------------------------------------------------
DO $check_org$
DECLARE
  v_org UUID;
BEGIN
  SELECT organization_id INTO v_org FROM _backfill_org;

  IF v_org = '00000000-0000-0000-0000-000000000000'::UUID THEN
    RAISE EXCEPTION
      'You have not set the organization id yet. Edit the _backfill_org block near the top.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org) THEN
    RAISE EXCEPTION
      'No organization with id %. Check you copied the whole id.', v_org;
  END IF;
END
$check_org$;


-- ----------------------------------------------------------------------------
--  CHECK 2: are the hours and reasons sane?
-- ----------------------------------------------------------------------------
DO $check_hours$
DECLARE
  bad RECORD;
BEGIN
  SELECT * INTO bad
  FROM _backfill_input
  WHERE regular_hours  IS NULL OR regular_hours  < 0 OR regular_hours  > 24
     OR overtime_hours IS NULL OR overtime_hours < 0 OR overtime_hours > 24
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Hours must be between 0 and 24. Check the row for % on %.',
      bad.employee_name, bad.shift_date;
  END IF;

  IF EXISTS (SELECT 1 FROM _backfill_input WHERE COALESCE(TRIM(reason), '') = '') THEN
    RAISE EXCEPTION
      'Every row needs a reason. That is what makes the change explainable later.';
  END IF;
END
$check_hours$;


-- ----------------------------------------------------------------------------
--  Resolve names to employee ids, scoped to this organization only.
--
--  The organization filter is the important part. employees.name is not unique
--  across the whole database, so matching on name alone would happily find a
--  "Dana Whitfield" who works at a different bar.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _backfill_resolved ON COMMIT DROP AS
SELECT
  i.employee_name,
  i.shift_date,
  i.regular_hours,
  i.overtime_hours,
  i.reason,
  o.organization_id,
  (
    SELECT COUNT(*)
    FROM employees e
    WHERE e.organization_id = o.organization_id
      AND LOWER(TRIM(e.name)) = LOWER(TRIM(i.employee_name))
  ) AS match_count,
  (
    -- ORDER BY + LIMIT, not MIN(). Postgres has no min(uuid) aggregate, and
    -- employees.id is a UUID -- MIN(e.id) failed with 42883 the first time this
    -- was run. CHECK 3 below rejects anything that matched other than exactly
    -- one employee, so this subquery only ever has one row to pick from; the
    -- ORDER BY just makes that pick deterministic rather than arbitrary.
    SELECT e.id
    FROM employees e
    WHERE e.organization_id = o.organization_id
      AND LOWER(TRIM(e.name)) = LOWER(TRIM(i.employee_name))
    ORDER BY e.id
    LIMIT 1
  ) AS employee_id
FROM _backfill_input i
CROSS JOIN _backfill_org o;


-- ----------------------------------------------------------------------------
--  RESULT TABLE 1: did every name resolve to exactly one person?
--  Read this first. 'OK' on every row means you can trust the preview below.
-- ----------------------------------------------------------------------------
SELECT
  employee_name,
  shift_date,
  CASE
    WHEN match_count = 0 THEN 'NOT FOUND - check the spelling'
    WHEN match_count > 1 THEN 'AMBIGUOUS - ' || match_count || ' employees share this name'
    ELSE 'OK'
  END AS name_check
FROM _backfill_resolved
ORDER BY employee_name, shift_date;


-- ----------------------------------------------------------------------------
--  CHECK 3: stop unless every name was exactly one person.
-- ----------------------------------------------------------------------------
DO $check_names$
DECLARE
  bad RECORD;
BEGIN
  SELECT * INTO bad FROM _backfill_resolved WHERE match_count <> 1 LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Cannot continue: "%" matched % employees in this bar. Fix the name in the EDIT ME block. (Nothing has been changed.)',
      bad.employee_name, bad.match_count;
  END IF;
END
$check_names$;


-- ----------------------------------------------------------------------------
--  RESULT TABLE 2: THE PREVIEW. This is the one to actually read.
--
--  'action' tells you whether a row is being corrected or created from nothing.
--  'change_in_hours' is what each person gains or loses -- scan that column for
--  anything that looks too big.
-- ----------------------------------------------------------------------------
SELECT
  r.employee_name,
  r.shift_date,
  COALESCE(s.regular_hours,  0) AS hours_before_regular,
  COALESCE(s.overtime_hours, 0) AS hours_before_overtime,
  r.regular_hours               AS hours_after_regular,
  r.overtime_hours              AS hours_after_overtime,
  (r.regular_hours + r.overtime_hours)
    - (COALESCE(s.regular_hours, 0) + COALESCE(s.overtime_hours, 0)) AS change_in_hours,
  CASE WHEN s.id IS NULL THEN 'CREATE (no shift recorded)' ELSE 'OVERWRITE' END AS action,
  r.reason
FROM _backfill_resolved r
LEFT JOIN employee_shifts s
  ON  s.organization_id = r.organization_id
  AND s.employee_id     = r.employee_id
  AND s.shift_date      = r.shift_date
ORDER BY r.shift_date, r.employee_name;


-- ----------------------------------------------------------------------------
--  WRITE 1: the audit log.
--
--  Deliberately written BEFORE the shifts are touched. Once employee_shifts is
--  overwritten the old figure is gone, so hours_before has to be captured while
--  it still exists.
-- ----------------------------------------------------------------------------
INSERT INTO payroll_adjustments (
  organization_id, shift_date, kind, employee_id,
  hours_before, hours_after, reason, created_by
)
SELECT
  r.organization_id,
  r.shift_date,
  'hours',
  r.employee_id,
  COALESCE(s.regular_hours, 0) + COALESCE(s.overtime_hours, 0),
  r.regular_hours + r.overtime_hours,
  r.reason,
  a.created_by
FROM _backfill_resolved r
CROSS JOIN _backfill_author a
LEFT JOIN employee_shifts s
  ON  s.organization_id = r.organization_id
  AND s.employee_id     = r.employee_id
  AND s.shift_date      = r.shift_date
-- Skip rows that would change nothing. A no-op adjustment in the log is noise
-- that makes the real corrections harder to find later.
WHERE (r.regular_hours + r.overtime_hours)
      IS DISTINCT FROM
      (COALESCE(s.regular_hours, 0) + COALESCE(s.overtime_hours, 0));


-- ----------------------------------------------------------------------------
--  WRITE 2: the hours themselves.
--
--  ON CONFLICT against the table's own uniqueness (organization_id,
--  employee_id, shift_date) handles both cases in one statement: it edits a
--  shift that exists and creates one that does not.
-- ----------------------------------------------------------------------------
INSERT INTO employee_shifts (
  organization_id, employee_id, shift_date, regular_hours, overtime_hours,
  hours_source, updated_at
)
SELECT
  r.organization_id,
  r.employee_id,
  r.shift_date,
  r.regular_hours,
  r.overtime_hours,
  -- Marks the row as owned by a person, so the POS agent leaves it alone.
  -- Without this the agent reverted anything inside its lookback window
  -- (2 days by default, 14 on some installs) within five minutes, and this
  -- script only appeared to work on dates older than that.
  'manual',
  NOW()
FROM _backfill_resolved r
ON CONFLICT (organization_id, employee_id, shift_date)
DO UPDATE SET
  regular_hours  = EXCLUDED.regular_hours,
  overtime_hours = EXCLUDED.overtime_hours,
  hours_source   = 'manual',
  updated_at     = NOW();


-- ----------------------------------------------------------------------------
--  RESULT TABLE 3: a one-line summary of the whole backfill.
-- ----------------------------------------------------------------------------
SELECT
  COUNT(*)                                      AS rows_in_backfill,
  COUNT(DISTINCT employee_id)                   AS people_affected,
  MIN(shift_date)                               AS earliest_date,
  MAX(shift_date)                               AS latest_date,
  ROUND(SUM(regular_hours + overtime_hours), 2) AS total_hours_after
FROM _backfill_resolved;


-- ============================================================================
--  NOTHING ABOVE IS SAVED YET.
--
--  The ROLLBACK below undoes it all. That is the safe default.
--
--  When the preview looked right, swap these two lines so they read:
--
--      -- ROLLBACK;
--      COMMIT;
--
--  then run the file again.
-- ============================================================================

ROLLBACK;
-- COMMIT;
