-- Per-server tips and sales captured from the text Z report server breakdown.
-- Used for individual tip mode (employee keeps their own tips) and
-- sales_pct tip mode (share of pool proportional to sales).
CREATE TABLE IF NOT EXISTS z_report_server_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  employee_name TEXT NOT NULL,
  total_sales DECIMAL(12, 2) DEFAULT 0,
  tips_paid_out DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, report_date, employee_name)
);

CREATE INDEX idx_z_server_tips_org ON z_report_server_tips(organization_id);
CREATE INDEX idx_z_server_tips_date ON z_report_server_tips(organization_id, report_date);

ALTER TABLE z_report_server_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_can_read_server_tips"
  ON z_report_server_tips FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_insert_server_tips"
  ON z_report_server_tips FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_update_server_tips"
  ON z_report_server_tips FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_delete_server_tips"
  ON z_report_server_tips FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );
