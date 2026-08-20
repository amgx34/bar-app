-- SMOKE TEST for backfill-employee-hours.sql
--
-- A ready-to-run copy, pre-filled against "2Touch Agent Test Bar"
-- (93888653-6a89-45f7-b9ce-c6dc86272669) -- the throwaway org from
-- 2touch-agent-dotnet/testdata/03-create-test-org.sql. No real bar is touched.
--
-- NOTHING TO EDIT. Select the whole file and Run.
--
-- It ends in ROLLBACK, so the first run writes nothing. It exists to prove the
-- template behaves before anyone points it at real wages.
--
-- WHAT IT EXERCISES
--   Alex Rivera   overwrite an existing shift DOWNWARD   10.00 -> 8.00
--   Jamie Chen    overwrite an existing shift UPWARD      9.00 -> 10.25
--   Morgan Patel  CREATE a shift that does not exist      0.00 -> 6.00
--   Sam Okafor    a NO-OP                                 7.00 -> 7.00
--
-- EXPECTED
--   Table 1  four rows, every name_check = 'OK'
--   Table 2  the four changes above; Morgan Patel = 'CREATE (no shift
--            recorded)', the other three = 'OVERWRITE'
--   Table 3  4 rows / 4 people / 2026-08-07 -> 2026-09-15 / 31.25 hours
--
--   3 payroll_adjustments rows, NOT 4 -- Sam Okafor is a no-op and the
--   IS DISTINCT FROM filter must skip him. That is the subtle one.
--
--   And all four shift rows marked hours_source='manual', so the POS agent
--   cannot revert them on its next sync.
--
-- Anything else means the template has a bug.

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


-- Pre-filled: the throwaway "2Touch Agent Test Bar".
CREATE TEMP TABLE _backfill_org ON COMMIT DROP AS
SELECT '93888653-6a89-45f7-b9ce-c6dc86272669'::UUID AS organization_id;


-- Pre-filled smoke-test rows.
INSERT INTO _backfill_input (employee_name, shift_date, regular_hours, overtime_hours, reason) VALUES
  ('Alex Rivera',  '2026-08-07', 8.00, 0.00, 'Smoke test - overwrite an existing shift downward'),
  ('Jamie Chen',   '2026-08-07', 9.00, 1.25, 'Smoke test - overwrite an existing shift upward'),
  ('Morgan Patel', '2026-09-15', 6.00, 0.00, 'Smoke test - create a shift that does not exist'),
  ('Sam Okafor',   '2026-08-07', 7.00, 0.00, 'Smoke test - no-op, must be skipped in the adjustment log')
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
--  RESULT TABLE 3: THE VERDICT. Every row must read PASS.
--
--  Self-asserting, and deliberately the LAST statement: the Supabase SQL editor
--  shows only the final result set when several run together, so this is the one
--  you are guaranteed to see.
--
--  It has to run INSIDE the transaction. The ROLLBACK below throws all of this
--  away, so the writes cannot be inspected afterwards -- in particular the
--  adjustment count, which is the whole point of the no-op branch.
-- ----------------------------------------------------------------------------
WITH shifts_now AS (
  SELECT e.name, s.shift_date, s.regular_hours, s.overtime_hours, s.hours_source
  FROM employee_shifts s
  JOIN employees e ON e.id = s.employee_id
  WHERE s.organization_id = (SELECT organization_id FROM _backfill_org)
),
checks(seq, assertion, expected, actual) AS (
  SELECT 1, 'rows in backfill', '4',
         (SELECT COUNT(*)::TEXT FROM _backfill_resolved)
  UNION ALL
  SELECT 2, 'people affected', '4',
         (SELECT COUNT(DISTINCT employee_id)::TEXT FROM _backfill_resolved)
  UNION ALL
  SELECT 3, 'total hours after', '31.25',
         (SELECT ROUND(SUM(regular_hours + overtime_hours), 2)::TEXT FROM _backfill_resolved)
  UNION ALL
  -- The subtle one. Sam Okafor's row changes nothing, so the IS DISTINCT FROM
  -- filter must skip him and write 3 log rows rather than 4.
  SELECT 4, 'adjustment rows written (no-op skipped)', '3',
         (SELECT COUNT(*)::TEXT FROM payroll_adjustments
          WHERE organization_id = (SELECT organization_id FROM _backfill_org))
  UNION ALL
  SELECT 5, 'Alex Rivera 2026-08-07 overwritten down', '8.00 / 0.00',
         (SELECT regular_hours || ' / ' || overtime_hours FROM shifts_now
          WHERE name = 'Alex Rivera' AND shift_date = DATE '2026-08-07')
  UNION ALL
  SELECT 6, 'Jamie Chen 2026-08-07 overwritten up', '9.00 / 1.25',
         (SELECT regular_hours || ' / ' || overtime_hours FROM shifts_now
          WHERE name = 'Jamie Chen' AND shift_date = DATE '2026-08-07')
  UNION ALL
  -- The other never-executed branch: a shift that did not exist at all.
  SELECT 7, 'Morgan Patel 2026-09-15 created', '6.00 / 0.00',
         (SELECT regular_hours || ' / ' || overtime_hours FROM shifts_now
          WHERE name = 'Morgan Patel' AND shift_date = DATE '2026-09-15')
  UNION ALL
  SELECT 8, 'Sam Okafor 2026-08-07 unchanged', '7.00 / 0.00',
         (SELECT regular_hours || ' / ' || overtime_hours FROM shifts_now
          WHERE name = 'Sam Okafor' AND shift_date = DATE '2026-08-07')
  UNION ALL
  -- Without this the agent reverts every row above within five minutes. All
  -- four must be claimed, including Sam Okafor: his hours did not change, but
  -- the operator still asserted them and the POS must not argue.
  SELECT 9, 'all four rows marked hours_source=manual', '4',
         (SELECT COUNT(*)::TEXT
          FROM employee_shifts s
          JOIN _backfill_resolved r
            ON  r.organization_id = s.organization_id
            AND r.employee_id     = s.employee_id
            AND r.shift_date      = s.shift_date
          WHERE s.hours_source = 'manual')
)
SELECT
  seq,
  assertion,
  expected,
  COALESCE(actual, '(nothing found)') AS actual,
  CASE WHEN actual IS NOT DISTINCT FROM expected THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM checks
-- A BARE output alias. Postgres accepts an output name in ORDER BY only as a
-- plain column reference -- wrap it in an expression like (verdict = 'PASS')
-- and only input columns are in scope, which fails with 42703. 'FAIL' sorts
-- before 'PASS' alphabetically, so problems come first for free.
ORDER BY verdict, seq;


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
