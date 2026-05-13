-- Create employees table for payroll tracking
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT, -- bartender, barback, server, manager, etc.
  hourly_rate DECIMAL(10, 2), -- default hourly rate
  tip_mode TEXT DEFAULT 'pool', -- pool, individual, or sales_pct
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, name)
);

-- Create index for faster lookups
CREATE INDEX idx_employees_org_id ON employees(organization_id);
CREATE INDEX idx_employees_org_name ON employees(organization_id, name);

-- Create employee_shifts table for time tracking
CREATE TABLE IF NOT EXISTS employee_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  regular_hours DECIMAL(5, 2) DEFAULT 0,
  overtime_hours DECIMAL(5, 2) DEFAULT 0,
  hourly_rate DECIMAL(10, 2), -- specific rate for this shift, overrides employee default
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, employee_id, shift_date)
);

-- Create index for faster lookups
CREATE INDEX idx_employee_shifts_org_id ON employee_shifts(organization_id);
CREATE INDEX idx_employee_shifts_employee_id ON employee_shifts(employee_id);
CREATE INDEX idx_employee_shifts_date ON employee_shifts(shift_date);

-- Create z_report_days table for daily sales and tips
CREATE TABLE IF NOT EXISTS z_report_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  total_sales DECIMAL(12, 2) DEFAULT 0,
  cash_tips DECIMAL(10, 2) DEFAULT 0,
  cc_tips DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, report_date)
);

-- Create index for faster lookups
CREATE INDEX idx_z_report_days_org_id ON z_report_days(organization_id);
CREATE INDEX idx_z_report_days_date ON z_report_days(report_date);

-- Enable RLS on all payroll tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_days ENABLE ROW LEVEL SECURITY;

-- RLS policies for employees (org members can read/write their org's employees)
CREATE POLICY "org_members_can_read_employees"
  ON employees FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_insert_employees"
  ON employees FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_update_employees"
  ON employees FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS policies for employee_shifts
CREATE POLICY "org_members_can_read_shifts"
  ON employee_shifts FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_insert_shifts"
  ON employee_shifts FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_update_shifts"
  ON employee_shifts FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_delete_shifts"
  ON employee_shifts FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS policies for z_report_days
CREATE POLICY "org_members_can_read_z_reports"
  ON z_report_days FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_insert_z_reports"
  ON z_report_days FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_update_z_reports"
  ON z_report_days FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_can_delete_z_reports"
  ON z_report_days FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );
