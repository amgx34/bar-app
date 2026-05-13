-- ── Demo / contact requests from the landing page ───────────────────────────
CREATE TABLE IF NOT EXISTS demo_requests (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(120) NOT NULL,
  business_name   VARCHAR(120) NOT NULL,
  email           VARCHAR(254) NOT NULL,
  phone           VARCHAR(30),
  num_locations   SMALLINT     NOT NULL DEFAULT 1,
  inquiry_type    VARCHAR(30)  NOT NULL DEFAULT 'general'
                  CHECK (inquiry_type IN ('general','demo','pricing','other')),
  message         TEXT,
  preferred_date  DATE,
  -- admin workflow
  status          VARCHAR(20)  NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','contacted','converted','closed')),
  notes           TEXT,          -- internal admin notes
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_demo_requests_status  ON demo_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_demo_requests_email   ON demo_requests (email);

-- No RLS — this table is admin-only (accessed via service role key only)
