-- ── Seed real POS sales data for kingr5183@gmail.com ─────────────────────────
-- Inserts into z_report_days only (the table used by Dashboard + Books).
-- Upsert-safe: re-running updates existing rows instead of erroring.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_user_id UUID;
  v_org_id  UUID;
BEGIN
  SELECT id INTO v_user_id
  FROM   auth.users
  WHERE  email = 'kingr5183@gmail.com'
  LIMIT  1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User kingr5183@gmail.com not found in auth.users';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM   memberships
  WHERE  user_id = v_user_id
  ORDER  BY created_at
  LIMIT  1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for kingr5183@gmail.com';
  END IF;

  RAISE NOTICE 'Seeding z_report_days for org %', v_org_id;

  INSERT INTO z_report_days (organization_id, report_date, total_sales, cash_tips, cc_tips)
  VALUES
    -- February 2026 (22 trading days, total = $54,307.98)
    (v_org_id, '2026-02-01',  1850.50, 0, 0),
    (v_org_id, '2026-02-03',   318.00, 0, 0),
    (v_org_id, '2026-02-04',   500.00, 0, 0),
    (v_org_id, '2026-02-05',  1743.00, 0, 0),
    (v_org_id, '2026-02-06',  3646.25, 0, 0),
    (v_org_id, '2026-02-07',  4362.00, 0, 0),
    (v_org_id, '2026-02-08',  4900.43, 0, 0),
    (v_org_id, '2026-02-10',   732.50, 0, 0),
    (v_org_id, '2026-02-11',   760.00, 0, 0),
    (v_org_id, '2026-02-12',  4408.25, 0, 0),
    (v_org_id, '2026-02-13',  2112.50, 0, 0),
    (v_org_id, '2026-02-14',  3331.00, 0, 0),
    (v_org_id, '2026-02-15',  2289.80, 0, 0),
    (v_org_id, '2026-02-17',   914.75, 0, 0),
    (v_org_id, '2026-02-18',   500.00, 0, 0),
    (v_org_id, '2026-02-19',  1823.25, 0, 0),
    (v_org_id, '2026-02-20',  4757.50, 0, 0),
    (v_org_id, '2026-02-21',  3923.00, 0, 0),
    (v_org_id, '2026-02-22',  2197.75, 0, 0),
    (v_org_id, '2026-02-26',  3138.75, 0, 0),
    (v_org_id, '2026-02-27',  3131.75, 0, 0),
    (v_org_id, '2026-02-28',  2967.00, 0, 0),
    -- March 2026 (19 trading days, total = $47,957.71)
    (v_org_id, '2026-03-01',  1093.25, 0, 0),
    (v_org_id, '2026-03-05',  3041.50, 0, 0),
    (v_org_id, '2026-03-06',  2176.25, 0, 0),
    (v_org_id, '2026-03-07',  4548.15, 0, 0),
    (v_org_id, '2026-03-08',  1632.00, 0, 0),
    (v_org_id, '2026-03-11',   138.00, 0, 0),
    (v_org_id, '2026-03-12',  2017.95, 0, 0),
    (v_org_id, '2026-03-13',  2719.99, 0, 0),
    (v_org_id, '2026-03-14',  5631.75, 0, 0),
    (v_org_id, '2026-03-15',  4735.62, 0, 0),
    (v_org_id, '2026-03-19',  3084.00, 0, 0),
    (v_org_id, '2026-03-20',  5086.25, 0, 0),
    (v_org_id, '2026-03-21',  2897.00, 0, 0),
    (v_org_id, '2026-03-22',  1400.50, 0, 0),
    (v_org_id, '2026-03-26',  1394.75, 0, 0),
    (v_org_id, '2026-03-27',  2355.50, 0, 0),
    (v_org_id, '2026-03-28',  3076.75, 0, 0),
    (v_org_id, '2026-03-29',   928.50, 0, 0),
    -- April 2026 (21 trading days, total = $40,100.98)
    (v_org_id, '2026-04-02',  1170.00, 0, 0),
    (v_org_id, '2026-04-03',  2700.40, 0, 0),
    (v_org_id, '2026-04-04',  2293.00, 0, 0),
    (v_org_id, '2026-04-05',    15.00, 0, 0),
    (v_org_id, '2026-04-06',   187.50, 0, 0),
    (v_org_id, '2026-04-09',  1196.25, 0, 0),
    (v_org_id, '2026-04-10',  4218.55, 0, 0),
    (v_org_id, '2026-04-11',  2602.00, 0, 0),
    (v_org_id, '2026-04-12',  2210.70, 0, 0),
    (v_org_id, '2026-04-16',  2632.75, 0, 0),
    (v_org_id, '2026-04-17',  2841.00, 0, 0),
    (v_org_id, '2026-04-18',  2099.10, 0, 0),
    (v_org_id, '2026-04-19',  1925.00, 0, 0),
    (v_org_id, '2026-04-20',   433.00, 0, 0),
    (v_org_id, '2026-04-22',    72.00, 0, 0),
    (v_org_id, '2026-04-23',   888.25, 0, 0),
    (v_org_id, '2026-04-24',  3407.58, 0, 0),
    (v_org_id, '2026-04-25',  6423.75, 0, 0),
    (v_org_id, '2026-04-26',  1061.40, 0, 0),
    (v_org_id, '2026-04-29',    39.50, 0, 0),
    (v_org_id, '2026-04-30',  1684.25, 0, 0)
  ON CONFLICT (organization_id, report_date) DO UPDATE SET
    total_sales = EXCLUDED.total_sales;

  RAISE NOTICE 'Done — 61 days inserted/updated for org %', v_org_id;
END $$;
