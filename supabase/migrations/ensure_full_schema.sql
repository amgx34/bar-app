-- ═══════════════════════════════════════════════════════════════════════════
-- RAIL — Full schema sync (idempotent)
-- Run this once in the Supabase SQL editor to bring any database up to the
-- current schema regardless of which individual migrations were applied.
-- Uses CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS throughout.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Enable required extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- EMPLOYEES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT         NOT NULL,
  role            TEXT,
  hourly_rate     DECIMAL(10,2),
  tip_mode        TEXT         DEFAULT 'pool',
  created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, name)
);
CREATE INDEX IF NOT EXISTS idx_employees_org_id   ON employees(organization_id);
CREATE INDEX IF NOT EXISTS idx_employees_org_name ON employees(organization_id, name);

-- ─────────────────────────────────────────────────────────────────────────────
-- EMPLOYEE_SHIFTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_shifts (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_date      DATE         NOT NULL,
  regular_hours   DECIMAL(5,2) DEFAULT 0,
  overtime_hours  DECIMAL(5,2) DEFAULT 0,
  hourly_rate     DECIMAL(10,2),
  role            TEXT,
  time_in         TIME,
  time_out        TIME,
  created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, employee_id, shift_date)
);
ALTER TABLE employee_shifts ADD COLUMN IF NOT EXISTS role     TEXT;
ALTER TABLE employee_shifts ADD COLUMN IF NOT EXISTS time_in  TIME;
ALTER TABLE employee_shifts ADD COLUMN IF NOT EXISTS time_out TIME;

CREATE INDEX IF NOT EXISTS idx_employee_shifts_org_id      ON employee_shifts(organization_id);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_employee_id ON employee_shifts(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_date        ON employee_shifts(shift_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- Z_REPORT_DAYS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS z_report_days (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_date     DATE          NOT NULL,
  total_sales     DECIMAL(12,2) DEFAULT 0,
  cash_tips       DECIMAL(10,2) DEFAULT 0,
  cc_tips         DECIMAL(10,2) DEFAULT 0,
  created_at      TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, report_date)
);
CREATE INDEX IF NOT EXISTS idx_z_report_days_org_id ON z_report_days(organization_id);
CREATE INDEX IF NOT EXISTS idx_z_report_days_date   ON z_report_days(report_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- Z_REPORTS  (expanded schema — add any missing columns idempotently)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS z_reports (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_date            DATE          NOT NULL,
  created_at             TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, report_date)
);

ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS report_start_time       TIMESTAMPTZ;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS report_end_time         TIMESTAMPTZ;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS z_report_number         TEXT;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS total_transactions      INTEGER          DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS subtotal                DECIMAL(12,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS tax                     DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS total_sales             DECIMAL(12,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS transaction_fee         DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS grand_total             DECIMAL(12,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS cash_sales              DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS credit_card_sales       DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS check_sales             DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS gift_card_redeemed      DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS loyalty_rewards         DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS tips_paid_out           DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS auto_tips_paid_out      DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS dine_in_total           DECIMAL(12,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS carry_out_total         DECIMAL(12,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS cash_received_sales     DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS cash_payments_received  DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS cash_paid_in            DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS cash_paid_out           DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS cash_paid_out_tips      DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS cash_on_hand            DECIMAL(10,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS credit_card_total       DECIMAL(12,2)    DEFAULT 0;
ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS credit_card_credits     DECIMAL(10,2)    DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_z_reports_org_id   ON z_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_z_reports_date     ON z_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_z_reports_org_date ON z_reports(organization_id, report_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- Z_REPORT_SERVER_TIPS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS z_report_server_tips (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_date     DATE          NOT NULL,
  employee_name   TEXT          NOT NULL,
  total_sales     DECIMAL(12,2) DEFAULT 0,
  tips_paid_out   DECIMAL(10,2) DEFAULT 0,
  created_at      TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, report_date, employee_name)
);
CREATE INDEX IF NOT EXISTS idx_z_server_tips_org  ON z_report_server_tips(organization_id);
CREATE INDEX IF NOT EXISTS idx_z_server_tips_date ON z_report_server_tips(report_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- POS_HOURLY_SALES & POS_SERVER_SALES (ticket-grain sales, independent of Z reports)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_hourly_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  business_date   DATE NOT NULL,
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

CREATE TABLE IF NOT EXISTS z_report_cc_types (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  z_report_id       UUID          NOT NULL REFERENCES z_reports(id) ON DELETE CASCADE,
  card_type         TEXT          NOT NULL,
  transaction_count INTEGER       DEFAULT 0,
  sales_amount      DECIMAL(10,2) DEFAULT 0,
  created_at        TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, z_report_id, card_type)
);

CREATE TABLE IF NOT EXISTS z_report_cc_batch (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  z_report_id             UUID          NOT NULL REFERENCES z_reports(id) ON DELETE CASCADE,
  batch_date              TIMESTAMPTZ,
  batch_number            TEXT,
  stored_sales_declined   DECIMAL(10,2) DEFAULT 0,
  stored_returns_declined DECIMAL(10,2) DEFAULT 0,
  approved_total          DECIMAL(12,2) DEFAULT 0,
  created_at              TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, z_report_id)
);

CREATE TABLE IF NOT EXISTS losses_reports (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  z_report_id          UUID          NOT NULL REFERENCES z_reports(id) ON DELETE CASCADE,
  report_date          DATE          NOT NULL,
  voids_amount         DECIMAL(10,2) DEFAULT 0,
  comps_amount         DECIMAL(10,2) DEFAULT 0,
  spills_amount        DECIMAL(10,2) DEFAULT 0,
  customer_acct_amount DECIMAL(10,2) DEFAULT 0,
  discounts_amount     DECIMAL(10,2) DEFAULT 0,
  created_at           TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, z_report_id)
);
CREATE INDEX IF NOT EXISTS idx_losses_org    ON losses_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_losses_report ON losses_reports(z_report_id);
CREATE INDEX IF NOT EXISTS idx_losses_date   ON losses_reports(report_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- ORGANIZATIONS — add columns that may be missing
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pos_provider  TEXT
  CHECK (pos_provider IN ('clover','toast','2touch'));
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pos_config    JSONB        NOT NULL DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bar_settings  JSONB        NOT NULL DEFAULT '{"tip_split_percent":15,"default_hourly_rate":15.00}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bar_type      VARCHAR(30);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bar_address   TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bar_phone     VARCHAR(30);

-- ─────────────────────────────────────────────────────────────────────────────
-- INVENTORY_ITEMS — add columns that may be missing
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS rep_id         UUID    REFERENCES reps(id) ON DELETE SET NULL;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS bottle_size_ml INTEGER;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS pour_size_oz   NUMERIC(4,2);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS cost_price     DECIMAL(10,2);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS sale_price     DECIMAL(10,2);

-- ─────────────────────────────────────────────────────────────────────────────
-- REPS & REP_ORDERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reps (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(120) NOT NULL,
  company         VARCHAR(120),
  phone           VARCHAR(30),
  email           VARCHAR(254),
  notes           TEXT,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_reps_org ON reps(organization_id);

CREATE TABLE IF NOT EXISTS rep_orders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rep_id          UUID        NOT NULL REFERENCES reps(id) ON DELETE RESTRICT,
  po_number       VARCHAR(64),
  delivery_date   DATE,
  notes           TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('draft','sent','confirmed','delivered','cancelled')),
  send_email      BOOLEAN     NOT NULL DEFAULT true,
  send_sms        BOOLEAN     NOT NULL DEFAULT false,
  items           JSONB       NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_rep_orders_org ON rep_orders(organization_id);
CREATE INDEX IF NOT EXISTS ix_rep_orders_rep ON rep_orders(rep_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- WEIGH_REPORTS & WEIGH_REPORT_ITEMS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weigh_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_date     DATE        NOT NULL,
  shift           VARCHAR(20) NOT NULL DEFAULT 'daily'
                  CHECK (shift IN ('opening','closing','daily')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_weigh_date_shift ON weigh_reports(organization_id, report_date, shift);
CREATE INDEX        IF NOT EXISTS ix_weigh_org_date   ON weigh_reports(organization_id, report_date DESC);

CREATE TABLE IF NOT EXISTS weigh_report_items (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  weigh_report_id     UUID         NOT NULL REFERENCES weigh_reports(id) ON DELETE CASCADE,
  inventory_item_id   UUID         REFERENCES inventory_items(id) ON DELETE SET NULL,
  item_name           VARCHAR(200) NOT NULL,
  bottle_size_ml      INTEGER,
  pour_size_oz        DECIMAL(4,2),
  cost_price          DECIMAL(10,2),
  opening_level       DECIMAL(5,3) CHECK (opening_level BETWEEN 0 AND 1),
  closing_level       DECIMAL(5,3) CHECK (closing_level BETWEEN 0 AND 1),
  full_bottles_opened SMALLINT     NOT NULL DEFAULT 0,
  notes               TEXT
);
CREATE INDEX IF NOT EXISTS ix_weigh_items_report ON weigh_report_items(weigh_report_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- DEMO_REQUESTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demo_requests (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120) NOT NULL,
  business_name VARCHAR(120) NOT NULL,
  email         VARCHAR(254) NOT NULL,
  phone         VARCHAR(30),
  num_locations SMALLINT    NOT NULL DEFAULT 1,
  inquiry_type  VARCHAR(30) NOT NULL DEFAULT 'general'
                CHECK (inquiry_type IN ('general','demo','pricing','other')),
  message       TEXT,
  preferred_date DATE,
  status        VARCHAR(20) NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','contacted','converted','closed')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- BAR_MESSAGES (notification inbox)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bar_messages (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sender_name      VARCHAR(120) NOT NULL,
  sender_email     VARCHAR(254),
  sender_company   VARCHAR(120),
  message_type     VARCHAR(50)  NOT NULL DEFAULT 'general',
  subject          VARCHAR(200) NOT NULL,
  body             TEXT,
  request_type     VARCHAR(100),
  item_category    VARCHAR(100),
  item_details     TEXT,
  quantity         VARCHAR(100),
  requested_amount DECIMAL(10,2),
  is_read          BOOLEAN      NOT NULL DEFAULT false,
  read_at          TIMESTAMPTZ,
  related_order_id UUID         REFERENCES rep_orders(id) ON DELETE SET NULL,
  message_status   VARCHAR(20)  NOT NULL DEFAULT 'pending',
  ai_breakdown     JSONB,
  gmail_message_id TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX        IF NOT EXISTS ix_bar_msg_org_read  ON bar_messages(organization_id, is_read, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_bar_msg_gmail_id  ON bar_messages(gmail_message_id) WHERE gmail_message_id IS NOT NULL;
CREATE INDEX        IF NOT EXISTS ix_bar_msg_order     ON bar_messages(related_order_id) WHERE related_order_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- DIRECT DEPOSIT TABLES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS direct_deposit_accounts (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id        UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  routing_encrypted  TEXT        NOT NULL,
  account_encrypted  TEXT        NOT NULL,
  account_last4      CHAR(4)     NOT NULL,
  bank_name          VARCHAR(120) NOT NULL,
  account_type       VARCHAR(10) NOT NULL CHECK (account_type IN ('checking','savings')),
  deposit_type       VARCHAR(20) NOT NULL DEFAULT 'full' CHECK (deposit_type IN ('full','percentage','fixed_amount')),
  deposit_value      INTEGER,
  priority           SMALLINT    NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 3),
  is_active          BOOLEAN     NOT NULL DEFAULT true,
  prenote_sent_at    TIMESTAMPTZ,
  consent_text       TEXT        NOT NULL,
  consent_ip         VARCHAR(45),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_dd_employee_priority
  ON direct_deposit_accounts(employee_id, priority) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS dd_verification_codes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL,
  employee_id     UUID        NOT NULL,
  code_hash       VARCHAR(64) NOT NULL,
  code_salt       VARCHAR(32) NOT NULL,
  action          VARCHAR(10) NOT NULL CHECK (action IN ('add','update','delete')),
  intent_encrypted TEXT,
  phone_last4     CHAR(4)     NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  attempts        SMALLINT    NOT NULL DEFAULT 0,
  is_used         BOOLEAN     NOT NULL DEFAULT false,
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      VARCHAR(45)
);
CREATE INDEX IF NOT EXISTS ix_dd_codes_employee ON dd_verification_codes(employee_id, expires_at);

CREATE TABLE IF NOT EXISTS dd_audit_log (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID  NOT NULL,
  employee_id     UUID  NOT NULL,
  action          VARCHAR(50) NOT NULL,
  before_state    JSONB,
  after_state     JSONB,
  ip_address      VARCHAR(45),
  code_id         UUID  REFERENCES dd_verification_codes(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_dd_audit_employee ON dd_audit_log(employee_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — enable on all tables (idempotent; ALTER TABLE ... ENABLE is safe to re-run)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE employees                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_shifts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_days              ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_reports                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_server_tips       ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_cc_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_cc_batch          ENABLE ROW LEVEL SECURITY;
ALTER TABLE losses_reports             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_hourly_sales           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_server_sales           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reps                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rep_orders                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE weigh_reports              ENABLE ROW LEVEL SECURITY;
ALTER TABLE weigh_report_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bar_messages               ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_deposit_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_verification_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_audit_log               ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES  (CREATE OR REPLACE where possible; skip if already exists)
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: create policy only if it doesn't already exist
-- Standard org-member pattern reused across all tables.

DO $policies$
DECLARE
  t TEXT;
  p TEXT;
BEGIN
  -- Tables that use the standard "org members can manage" pattern
  FOREACH t IN ARRAY ARRAY[
    'reps','rep_orders','weigh_reports','weigh_report_items',
    'z_report_days','z_reports','z_report_server_tips',
    'z_report_cc_types','z_report_cc_batch',
    'losses_reports','employees','employee_shifts',
    'direct_deposit_accounts','dd_verification_codes','dd_audit_log'
  ] LOOP
    p := 'org members can manage ' || t;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=p
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (
           organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
         )',
        p, t
      );
    END IF;
  END LOOP;

  -- bar_messages: public INSERT, members-only SELECT/UPDATE/DELETE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bar_messages' AND policyname='public can insert bar messages'
  ) THEN
    CREATE POLICY "public can insert bar messages" ON bar_messages FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bar_messages' AND policyname='org members can read bar messages'
  ) THEN
    CREATE POLICY "org members can read bar messages" ON bar_messages FOR SELECT
      USING (organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bar_messages' AND policyname='org members can update bar messages'
  ) THEN
    CREATE POLICY "org members can update bar messages" ON bar_messages FOR UPDATE
      USING (organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bar_messages' AND policyname='org members can delete bar messages'
  ) THEN
    CREATE POLICY "org members can delete bar messages" ON bar_messages FOR DELETE
      USING (organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pos_hourly_sales' AND policyname='org_members_read_pos_hourly_sales'
  ) THEN
    CREATE POLICY "org_members_read_pos_hourly_sales" ON pos_hourly_sales FOR SELECT
      USING (
        organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pos_server_sales' AND policyname='org_members_read_pos_server_sales'
  ) THEN
    CREATE POLICY "org_members_read_pos_server_sales" ON pos_server_sales FOR SELECT
      USING (
        organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
      );
  END IF;
END $policies$;

-- ─────────────────────────────────────────────────────────────────────────────
RAISE NOTICE 'Schema sync complete.';
-- ─────────────────────────────────────────────────────────────────────────────
