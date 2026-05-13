# Payroll System Setup Guide

## Overview
This payroll system replaces the TwoTouch SQL Server integration with a CSV-based import system. Bar owners can now upload employee shift data and Z reports from any POS system.

## Database Setup

Run the migration in Supabase to create the required tables:

```sql
-- From: supabase/migrations/20260424000000_create_payroll_tables.sql
```

The migration creates three tables:
- **employees**: Employee master data with roles, hourly rates, and tip distribution mode
- **employee_shifts**: Individual shift records with hours and rates
- **z_report_days**: Daily sales and tip data from POS Z reports

## Features

### 1. Import Payroll Data
Upload CSV files for:
- **Employee Worked Reports**: Time clock data with names, dates, regular hours, overtime hours, and optional rates
- **Z Reports**: Daily sales totals and tip breakdowns from your POS system

The system automatically:
- Detects column headers (case-insensitive and flexible naming)
- Creates new employee records as they appear in imports
- Prevents duplicate data by replacing previous imports for the same date range

### 2. Employee Configuration
For each employee, configure:
- **Role**: Bartender, Barback, Server, Manager, Other
- **Hourly Rate**: Default rate used for pay calculations
- **Tip Distribution Mode**:
  - **Pool**: Tips split proportionally by hours worked (recommended for pooled tip systems)
  - **Individual**: Each employee keeps their own tracked tips (requires per-employee tip data)
  - **Sales %**: Tips distributed by sales percentage (requires sales tracking per employee)

### 3. Payroll Calculation
Select a date range to compute payroll showing:
- Total regular and overtime hours
- Regular pay and overtime pay (1.5x rate)
- Tips distribution based on configured mode
- Total compensation per employee

## CSV Format Requirements

### Employee Worked Reports
Expected columns (flexible naming):
- Employee Name (or: name, employee, employee_name)
- Date (or: shift_date, date, work_date)
- Regular Hours (or: regular_hours, reg hours, hours)
- Overtime Hours (or: overtime_hours, ot hours, ot_hours)
- Hourly Rate (optional - or: rate, hourly_rate, pay_rate)

Example:
```
Employee,Date,Regular Hours,Overtime Hours,Hourly Rate
John Smith,01/15/2026,8,0,15.50
Jane Doe,01/15/2026,8,2,16.00
```

### Z Reports
Expected columns (flexible naming):
- Date (or: report_date, z_date, business_date)
- Total Sales (or: sales, total_sales, gross_sales)
- Cash Tips (or: cash_tips, cash tip)
- Credit Card Tips (or: cc_tips, credit_card_tips, card_tips)

Example:
```
Date,Total Sales,Cash Tips,Credit Card Tips
01/15/2026,1250.00,150.00,200.00
01/16/2026,1400.00,175.00,225.00
```

## Implementation Files

### Core Utilities
- `lib/csv-parsers/parse-employee-shifts.ts`: Employee shift CSV parsing
- `lib/csv-parsers/parse-z-reports.ts`: Z report CSV parsing

### Server Actions
- `app/(app)/app/payroll/actions.ts`: Database operations and payroll calculations
  - `saveEmployee()`: Create/update employee
  - `saveEmployeeShifts()`: Import shift data
  - `saveZReports()`: Import Z report data
  - `computePayroll()`: Calculate payroll for date range

### Components
- `app/(app)/app/payroll/page.tsx`: Main payroll page with tabs
- `app/(app)/app/payroll/_components/payroll-tab.tsx`: Payroll summary and table
- `app/(app)/app/payroll/_components/import-tab.tsx`: CSV import interface
- `app/(app)/app/payroll/_components/employees-tab.tsx`: Employee list and management
- `app/(app)/app/payroll/_components/csv-upload.tsx`: File upload and preview
- `app/(app)/app/payroll/_components/employee-setup-dialog.tsx`: Employee configuration form

## Usage Workflow

1. **Import Employee Data**
   - Go to Payroll → Import tab
   - Upload employee worked report CSV from your POS
   - Verify preview and confirm import
   - New employees will be marked as incomplete

2. **Configure Employees**
   - Go to Payroll → Employees tab
   - Edit each incomplete employee
   - Set role, hourly rate, and tip distribution method

3. **Import Z Reports**
   - Go to Payroll → Import tab
   - Upload Z report CSV from your POS
   - Verify preview and confirm import

4. **View Payroll**
   - Go to Payroll → Payroll tab
   - Select date range (defaults to current week)
   - View summary cards and detailed table
   - Summary shows total hours, pay, and tips

## Tip Distribution Examples

### Pool (Default)
- Total tips from Z reports: $500
- Team hours: 60 hours
- John (20 hours): $500 × (20/60) = $166.67
- Jane (20 hours): $500 × (20/60) = $166.67
- Mike (20 hours): $500 × (20/60) = $166.67

### Individual
- Tips are tracked per employee in the import data
- Each employee gets their recorded tips
- Requires per-employee tip data in imports

### Sales %
- Tips distributed based on each employee's sales
- Requires sales data per employee in imports
- Useful for commission-based tip systems

## Migration from TwoTouch

The following files and dependencies were removed:
- `lib/twouch/client.ts` - TwoTouch API client
- `lib/twouch/payroll.ts` - TwoTouch payroll logic
- `mssql` npm package
- `@types/mssql` npm package
- `TWOUCH_SQL_*` environment variables

If you still need TwoTouch integration:
1. Export your data as CSV from TwoTouch
2. Map it to the expected column format
3. Import using the new CSV system
