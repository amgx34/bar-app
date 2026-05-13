-- Comprehensive Z Report and Payroll Schema for Multi-Tenant Bars
-- All tables use organization_id for data isolation between bar locations

-- Expand employee_shifts to capture more detail
ALTER TABLE IF EXISTS employee_shifts ADD COLUMN IF NOT EXISTS role TEXT; -- bartender, barback, server, ambassador, etc
ALTER TABLE IF EXISTS employee_shifts ADD COLUMN IF NOT EXISTS time_in TIME;
ALTER TABLE IF EXISTS employee_shifts ADD COLUMN IF NOT EXISTS time_out TIME;

-- Z Report Daily Summary (main daily report)
CREATE TABLE IF NOT EXISTS z_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  report_start_time TIMESTAMP WITH TIME ZONE,
  report_end_time TIMESTAMP WITH TIME ZONE,
  z_report_number TEXT,
  total_transactions INTEGER DEFAULT 0,
  
  -- Sales totals
  subtotal DECIMAL(12, 2) DEFAULT 0,
  tax DECIMAL(10, 2) DEFAULT 0,
  total_sales DECIMAL(12, 2) DEFAULT 0,
  transaction_fee DECIMAL(10, 2) DEFAULT 0,
  grand_total DECIMAL(12, 2) DEFAULT 0,
  
  -- Payment methods
  cash_sales DECIMAL(10, 2) DEFAULT 0,
  credit_card_sales DECIMAL(10, 2) DEFAULT 0,
  check_sales DECIMAL(10, 2) DEFAULT 0,
  gift_card_redeemed DECIMAL(10, 2) DEFAULT 0,
  loyalty_rewards DECIMAL(10, 2) DEFAULT 0,
  
  -- Tips
  tips_paid_out DECIMAL(10, 2) DEFAULT 0,
  auto_tips_paid_out DECIMAL(10, 2) DEFAULT 0,
  
  -- Dine in vs carry out
  dine_in_total DECIMAL(12, 2) DEFAULT 0,
  carry_out_total DECIMAL(12, 2) DEFAULT 0,
  
  -- Cash summary
  cash_received_sales DECIMAL(10, 2) DEFAULT 0,
  cash_payments_received DECIMAL(10, 2) DEFAULT 0,
  cash_paid_in DECIMAL(10, 2) DEFAULT 0,
  cash_paid_out DECIMAL(10, 2) DEFAULT 0,
  cash_paid_out_tips DECIMAL(10, 2) DEFAULT 0,
  cash_on_hand DECIMAL(10, 2) DEFAULT 0,
  
  -- Credit card summary
  credit_card_total DECIMAL(12, 2) DEFAULT 0,
  credit_card_credits DECIMAL(10, 2) DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, report_date)
);

CREATE INDEX idx_z_reports_org_id ON z_reports(organization_id);
CREATE INDEX idx_z_reports_date ON z_reports(report_date);
CREATE INDEX idx_z_reports_org_date ON z_reports(organization_id, report_date);

-- Z Report Sales by Category
CREATE TABLE IF NOT EXISTS z_report_category_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  z_report_id UUID NOT NULL REFERENCES z_reports(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  sales_amount DECIMAL(10, 2) DEFAULT 0,
  sales_percentage DECIMAL(5, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, z_report_id, category_name)
);

CREATE INDEX idx_z_report_category_org ON z_report_category_sales(organization_id);
CREATE INDEX idx_z_report_category_report ON z_report_category_sales(z_report_id);

-- Z Report Sales by Department
CREATE TABLE IF NOT EXISTS z_report_department_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  z_report_id UUID NOT NULL REFERENCES z_reports(id) ON DELETE CASCADE,
  department_name TEXT NOT NULL,
  sales_amount DECIMAL(10, 2) DEFAULT 0,
  sales_percentage DECIMAL(5, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, z_report_id, department_name)
);

CREATE INDEX idx_z_report_dept_org ON z_report_department_sales(organization_id);
CREATE INDEX idx_z_report_dept_report ON z_report_department_sales(z_report_id);

-- Z Report Sales by Register/Terminal (numbered 1-8 in the report)
CREATE TABLE IF NOT EXISTS z_report_register_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  z_report_id UUID NOT NULL REFERENCES z_reports(id) ON DELETE CASCADE,
  register_number INTEGER NOT NULL,
  cash_sales DECIMAL(10, 2) DEFAULT 0,
  credit_card_sales DECIMAL(10, 2) DEFAULT 0,
  tips_paid_out DECIMAL(10, 2) DEFAULT 0,
  total_sales DECIMAL(10, 2) DEFAULT 0,
  total_collected DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, z_report_id, register_number)
);

CREATE INDEX idx_z_report_register_org ON z_report_register_sales(organization_id);
CREATE INDEX idx_z_report_register_report ON z_report_register_sales(z_report_id);

-- Z Report Sales by Server
CREATE TABLE IF NOT EXISTS z_report_server_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  z_report_id UUID NOT NULL REFERENCES z_reports(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  server_name TEXT NOT NULL,
  cash_sales DECIMAL(10, 2) DEFAULT 0,
  credit_card_sales DECIMAL(10, 2) DEFAULT 0,
  tips_paid_out DECIMAL(10, 2) DEFAULT 0,
  total_sales DECIMAL(10, 2) DEFAULT 0,
  cash_due DECIMAL(10, 2), -- can be negative (cash received from server)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, z_report_id, server_name)
);

CREATE INDEX idx_z_report_server_org ON z_report_server_sales(organization_id);
CREATE INDEX idx_z_report_server_report ON z_report_server_sales(z_report_id);
CREATE INDEX idx_z_report_server_employee ON z_report_server_sales(employee_id);

-- Z Report Hourly Sales Breakdown
CREATE TABLE IF NOT EXISTS z_report_hourly_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  z_report_id UUID NOT NULL REFERENCES z_reports(id) ON DELETE CASCADE,
  hour_start TIME NOT NULL,
  hour_end TIME NOT NULL,
  sales_amount DECIMAL(10, 2) DEFAULT 0,
  sales_percentage DECIMAL(5, 2) DEFAULT 0,
  ticket_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, z_report_id, hour_start, hour_end)
);

CREATE INDEX idx_z_report_hourly_org ON z_report_hourly_sales(organization_id);
CREATE INDEX idx_z_report_hourly_report ON z_report_hourly_sales(z_report_id);

-- Z Report Credit Card Types (Mastercard, Visa, Discover, Amex, etc)
CREATE TABLE IF NOT EXISTS z_report_cc_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  z_report_id UUID NOT NULL REFERENCES z_reports(id) ON DELETE CASCADE,
  card_type TEXT NOT NULL,
  transaction_count INTEGER DEFAULT 0,
  sales_amount DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, z_report_id, card_type)
);

CREATE INDEX idx_z_report_cc_type_org ON z_report_cc_types(organization_id);
CREATE INDEX idx_z_report_cc_type_report ON z_report_cc_types(z_report_id);

-- Credit Card Batch Summary
CREATE TABLE IF NOT EXISTS z_report_cc_batch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  z_report_id UUID NOT NULL REFERENCES z_reports(id) ON DELETE CASCADE,
  batch_date TIMESTAMP WITH TIME ZONE,
  batch_number TEXT,
  stored_sales_declined DECIMAL(10, 2) DEFAULT 0,
  stored_returns_declined DECIMAL(10, 2) DEFAULT 0,
  approved_total DECIMAL(12, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, z_report_id)
);

CREATE INDEX idx_z_report_cc_batch_org ON z_report_cc_batch(organization_id);
CREATE INDEX idx_z_report_cc_batch_report ON z_report_cc_batch(z_report_id);

-- Losses Report (Voids, Comps, Spills, Discounts)
CREATE TABLE IF NOT EXISTS losses_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  z_report_id UUID NOT NULL REFERENCES z_reports(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  voids_amount DECIMAL(10, 2) DEFAULT 0,
  comps_amount DECIMAL(10, 2) DEFAULT 0,
  spills_amount DECIMAL(10, 2) DEFAULT 0,
  customer_acct_amount DECIMAL(10, 2) DEFAULT 0,
  discounts_amount DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, z_report_id)
);

CREATE INDEX idx_losses_org ON losses_reports(organization_id);
CREATE INDEX idx_losses_report ON losses_reports(z_report_id);
CREATE INDEX idx_losses_date ON losses_reports(report_date);

-- Enable RLS on all new tables
ALTER TABLE z_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_category_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_department_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_register_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_server_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_hourly_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_cc_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_cc_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE losses_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for z_reports
CREATE POLICY "org_members_can_read_z_reports"
  ON z_reports FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_insert_z_reports"
  ON z_reports FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_update_z_reports"
  ON z_reports FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_delete_z_reports"
  ON z_reports FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for z_report_category_sales
CREATE POLICY "org_members_can_read_z_report_category_sales"
  ON z_report_category_sales FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_insert_z_report_category_sales"
  ON z_report_category_sales FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_delete_z_report_category_sales"
  ON z_report_category_sales FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for z_report_department_sales
CREATE POLICY "org_members_can_read_z_report_department_sales"
  ON z_report_department_sales FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_insert_z_report_department_sales"
  ON z_report_department_sales FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_delete_z_report_department_sales"
  ON z_report_department_sales FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for z_report_register_sales
CREATE POLICY "org_members_can_read_z_report_register_sales"
  ON z_report_register_sales FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_insert_z_report_register_sales"
  ON z_report_register_sales FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_delete_z_report_register_sales"
  ON z_report_register_sales FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for z_report_server_sales
CREATE POLICY "org_members_can_read_z_report_server_sales"
  ON z_report_server_sales FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_insert_z_report_server_sales"
  ON z_report_server_sales FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_delete_z_report_server_sales"
  ON z_report_server_sales FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for z_report_hourly_sales
CREATE POLICY "org_members_can_read_z_report_hourly_sales"
  ON z_report_hourly_sales FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_insert_z_report_hourly_sales"
  ON z_report_hourly_sales FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_delete_z_report_hourly_sales"
  ON z_report_hourly_sales FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for z_report_cc_types
CREATE POLICY "org_members_can_read_z_report_cc_types"
  ON z_report_cc_types FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_insert_z_report_cc_types"
  ON z_report_cc_types FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_delete_z_report_cc_types"
  ON z_report_cc_types FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for z_report_cc_batch
CREATE POLICY "org_members_can_read_z_report_cc_batch"
  ON z_report_cc_batch FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_insert_z_report_cc_batch"
  ON z_report_cc_batch FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_delete_z_report_cc_batch"
  ON z_report_cc_batch FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for losses_reports
CREATE POLICY "org_members_can_read_losses_reports"
  ON losses_reports FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_insert_losses_reports"
  ON losses_reports FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_update_losses_reports"
  ON losses_reports FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_delete_losses_reports"
  ON losses_reports FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );
