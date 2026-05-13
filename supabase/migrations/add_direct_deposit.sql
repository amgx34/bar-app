-- Direct deposit bank accounts per employee.
-- Routing + account numbers are stored AES-256-GCM encrypted — never plaintext.
CREATE TABLE IF NOT EXISTS direct_deposit_accounts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id      UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  routing_encrypted TEXT       NOT NULL,
  account_encrypted TEXT       NOT NULL,
  account_last4    CHAR(4)     NOT NULL,
  bank_name        VARCHAR(120) NOT NULL,
  account_type     VARCHAR(10) NOT NULL CHECK (account_type IN ('checking','savings')),
  deposit_type     VARCHAR(20) NOT NULL DEFAULT 'full'
                   CHECK (deposit_type IN ('full','percentage','fixed_amount')),
  deposit_value    INTEGER,
  priority         SMALLINT    NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 3),
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  prenote_sent_at  TIMESTAMPTZ,
  consent_text     TEXT        NOT NULL,
  consent_ip       VARCHAR(45),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dd_employee_priority_active
  ON direct_deposit_accounts (employee_id, priority)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ix_dd_org_employee
  ON direct_deposit_accounts (organization_id, employee_id);

-- SMS OTP codes — code is HMAC-SHA256 hashed, never stored in plaintext.
CREATE TABLE IF NOT EXISTS dd_verification_codes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL,
  employee_id      UUID        NOT NULL,
  code_hash        VARCHAR(64) NOT NULL,
  code_salt        VARCHAR(32) NOT NULL,
  action           VARCHAR(10) NOT NULL CHECK (action IN ('add','update','delete')),
  intent_encrypted TEXT,
  phone_last4      CHAR(4)     NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  attempts         SMALLINT    NOT NULL DEFAULT 0,
  is_used          BOOLEAN     NOT NULL DEFAULT false,
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address       VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS ix_dd_codes_org_emp
  ON dd_verification_codes (organization_id, employee_id, created_at);

-- Immutable audit trail. Account numbers masked to last-4 before insert.
CREATE TABLE IF NOT EXISTS dd_audit_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL,
  employee_id      UUID        NOT NULL,
  action           VARCHAR(50) NOT NULL,
  before_state     JSONB,
  after_state      JSONB,
  ip_address       VARCHAR(45),
  code_id          UUID        REFERENCES dd_verification_codes(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_dd_audit_org_emp
  ON dd_audit_log (organization_id, employee_id, created_at);
