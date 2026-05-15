-- ── Shift weigh reports (pour tracking) ──────────────────────────────────────
-- Each row = one weigh session (opening / closing / daily) for a given date.
CREATE TABLE IF NOT EXISTS weigh_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_date     DATE        NOT NULL,
  shift           VARCHAR(20) NOT NULL DEFAULT 'daily'
                  CHECK (shift IN ('opening','closing','daily')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_weigh_date_shift
  ON weigh_reports (organization_id, report_date, shift);
CREATE INDEX IF NOT EXISTS ix_weigh_org_date
  ON weigh_reports (organization_id, report_date DESC);

-- ── Per-bottle measurements within a weigh report ────────────────────────────
-- Bottle fullness tracked as a fraction 0.000–1.000 (tenths method common in bars).
-- consumed = (opening_level - closing_level + full_bottles_opened) × bottle_oz
CREATE TABLE IF NOT EXISTS weigh_report_items (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  weigh_report_id     UUID         NOT NULL REFERENCES weigh_reports(id) ON DELETE CASCADE,
  inventory_item_id   UUID         REFERENCES inventory_items(id) ON DELETE SET NULL,
  item_name           VARCHAR(200) NOT NULL,    -- denormalised for historical accuracy
  bottle_size_ml      INTEGER,
  pour_size_oz        DECIMAL(4,2),
  cost_price          DECIMAL(10,2),
  -- 0.000 = empty, 1.000 = completely full
  opening_level       DECIMAL(5,3) CHECK (opening_level BETWEEN 0 AND 1),
  closing_level       DECIMAL(5,3) CHECK (closing_level BETWEEN 0 AND 1),
  full_bottles_opened SMALLINT     NOT NULL DEFAULT 0,
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS ix_weigh_items_report
  ON weigh_report_items (weigh_report_id);

-- ── Row-Level Security ────────────────────────────────────────────────────────
ALTER TABLE weigh_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE weigh_report_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage weigh_reports"
  ON weigh_reports FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM memberships WHERE user_id = auth.uid()
  ));

CREATE POLICY "org members can manage weigh_report_items"
  ON weigh_report_items FOR ALL
  USING (weigh_report_id IN (
    SELECT id FROM weigh_reports
    WHERE organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  ));
