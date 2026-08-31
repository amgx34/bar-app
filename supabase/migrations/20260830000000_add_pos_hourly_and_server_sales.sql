-- Ticket-grain sales capture.
--
-- pos_item_sales answers WHAT sold. These answer WHEN and WHO, which is what a
-- busy bar is actually managed by: when the rush lands, whether the bar is
-- staffed for it, what the average ticket is.
--
-- The source has always had this. tblSalesHdrHist carries dtmTicketDate
-- (a datetime), fkUserID and szTicketNo; the agent reads that table already and
-- collapses the time away to derive a business date.

CREATE TABLE IF NOT EXISTS pos_hourly_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- The night the trade belongs to, already offset by the bar's cutoff hour.
  business_date   DATE NOT NULL,
  -- The real clock hour, 0-23. A 01:30 ticket on Sunday morning is
  -- (business_date = Saturday, hour = 1). Storing a shifted hour instead would
  -- make this column meaningless to anyone reading the table directly; display
  -- ordering is resolved from the cutoff hour at read time.
  hour            SMALLINT NOT NULL CHECK (hour BETWEEN 0 AND 23),
  net_sales       NUMERIC(14,2) NOT NULL DEFAULT 0,
  ticket_count    INTEGER       NOT NULL DEFAULT 0,
  tips            NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, business_date, hour)
);

CREATE INDEX IF NOT EXISTS idx_pos_hourly_org_date
  ON pos_hourly_sales(organization_id, business_date);

CREATE TABLE IF NOT EXISTS pos_server_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  business_date   DATE NOT NULL,
  -- As the POS reports it, and the natural key. Resolution to an employee is
  -- done at READ time and left nullable here: a bartender who is not on the
  -- payroll list still sold the drinks, and a later rename must be able to fix
  -- historical rows without a backfill.
  server_name     TEXT NOT NULL,
  employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  net_sales       NUMERIC(14,2) NOT NULL DEFAULT 0,
  ticket_count    INTEGER       NOT NULL DEFAULT 0,
  tips            NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, business_date, server_name)
);

CREATE INDEX IF NOT EXISTS idx_pos_server_org_date
  ON pos_server_sales(organization_id, business_date);

-- The five tables below were created in 20260424000001_expand_z_reports_schema
-- for exactly this data and have never held a row: nothing writes them and
-- nothing reads them. They hang off a z_report_id FK, so they need a settled Z
-- report to attach to and cannot hold live intraday trade, which is the point
-- of the tables above.
--
-- Dropped rather than left in place because two plausible homes for "hourly
-- sales" is the condition that produced the netOperating bug in Books, where
-- one name meant two different numbers in two files.
DROP TABLE IF EXISTS z_report_hourly_sales;
DROP TABLE IF EXISTS z_report_server_sales;
DROP TABLE IF EXISTS z_report_register_sales;
DROP TABLE IF EXISTS z_report_category_sales;
DROP TABLE IF EXISTS z_report_department_sales;

-- ── Row level security ───────────────────────────────────────────────────────

ALTER TABLE pos_hourly_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_server_sales  ENABLE ROW LEVEL SECURITY;

-- Postgres has no CREATE POLICY IF NOT EXISTS, so a re-run would abort on the
-- first one and leave the rest of this file unapplied. Dropping first keeps the
-- migration safe to run more than once.
DROP POLICY IF EXISTS "org_members_read_pos_hourly_sales" ON pos_hourly_sales;
DROP POLICY IF EXISTS "org_members_read_pos_server_sales" ON pos_server_sales;

-- Sales are written only by the ingest route (service role, which bypasses RLS).
-- Members get read access so the UI can show them; nothing in the app should
-- ever write these by hand.
CREATE POLICY "org_members_read_pos_hourly_sales"
  ON pos_hourly_sales FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "org_members_read_pos_server_sales"
  ON pos_server_sales FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  );
