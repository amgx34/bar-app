# Z Report Database Schema Documentation

## Overview
This schema captures detailed Point-of-Sale (POS) Z report data for bar operations. It's designed for multi-tenant use where multiple bar locations (organizations) can safely coexist without accessing each other's data.

## Multi-Tenancy & Data Isolation

**CRITICAL SECURITY FEATURE**: Every table includes `organization_id` and has Row-Level Security (RLS) policies enabled.

### How Data Isolation Works:
1. **Organization ID**: Every single row in every table stores the organization it belongs to
2. **RLS Policies**: Supabase enforces row-level security policies that prevent users from accessing data outside their organization
3. **Database Constraints**: Users can only see/modify/delete data for organizations they're members of

### Example:
- Bar A (Organization 1) imports a Z report → Only Bar A members can see it
- Bar B (Organization 2) member logs in → Cannot see, access, or modify Bar A's Z reports
- Even if Bar B tries to query `z_reports` table → RLS returns 0 rows outside their organization

## Table Structure

### Core Tables

#### `z_reports` (Main Daily Report)
Stores the complete daily Z report summary with all financial totals.

**Key Fields:**
- `organization_id` - Multi-tenancy key
- `report_date` - The business date
- `z_report_number` - POS system report number
- `total_transactions` - Number of transactions
- `subtotal`, `tax`, `total_sales`, `grand_total` - Financial totals
- `cash_sales`, `credit_card_sales`, `check_sales` - Payment methods
- `tips_paid_out` - Total tips
- `dine_in_total`, `carry_out_total` - Sales by service type
- `cash_on_hand` - Cash drawer reconciliation
- Timestamps for the report period

**Index Strategy:**
- Fast lookup by organization: `idx_z_reports_org_id`
- Fast lookup by date: `idx_z_reports_date`
- Fast lookup by both: `idx_z_reports_org_date`

#### `z_report_category_sales` (Sales by Category)
Detailed breakdown by product category (Cocktails, Beer, Shots, Vodka, etc.)

**Fields:**
- `organization_id` - Multi-tenancy
- `z_report_id` - Foreign key to parent Z report
- `category_name` - Category name (e.g., "Vodka", "Cocktails")
- `sales_amount` - Total sales for this category
- `sales_percentage` - Percentage of total sales

#### `z_report_department_sales` (Sales by Department)
Breakdown by department (Beer, Liquor, Seltzers & Cans, Soda & Mixers)

**Fields:**
- `organization_id` - Multi-tenancy
- `z_report_id` - Foreign key to parent Z report
- `department_name` - Department name
- `sales_amount` - Total sales
- `sales_percentage` - Percentage of total

#### `z_report_register_sales` (Sales by Register/Terminal)
Tracks sales by POS register/terminal (numbered 1-8, etc.)

**Fields:**
- `organization_id` - Multi-tenancy
- `z_report_id` - Foreign key
- `register_number` - Register ID
- `cash_sales`, `credit_card_sales` - Payment methods
- `tips_paid_out` - Tips from this register
- `total_sales`, `total_collected` - Totals

#### `z_report_server_sales` (Sales by Server)
Tracks individual server/bartender sales and cash reconciliation

**Fields:**
- `organization_id` - Multi-tenancy
- `z_report_id` - Foreign key
- `employee_id` - Optional link to employees table
- `server_name` - Server name from POS
- `cash_sales`, `credit_card_sales` - Payment methods
- `tips_paid_out` - Tips for this server
- `total_sales` - Total sales
- `cash_due` - Cash owed/received (can be negative)

#### `z_report_hourly_sales` (Sales by Hour)
Breakdown of sales by hour of operation

**Fields:**
- `organization_id` - Multi-tenancy
- `z_report_id` - Foreign key
- `hour_start`, `hour_end` - Time range (e.g., 21:00 - 21:59)
- `sales_amount` - Sales in that hour
- `sales_percentage` - Percentage of daily sales
- `ticket_count` - Number of transactions

#### `z_report_cc_types` (Credit Card Breakdown)
Details of credit card sales by card type

**Fields:**
- `organization_id` - Multi-tenancy
- `z_report_id` - Foreign key
- `card_type` - Type (Mastercard, Visa, Discover, American Express)
- `transaction_count` - Number of transactions
- `sales_amount` - Total sales for this card type

#### `z_report_cc_batch` (Credit Card Batch Summary)
Credit card processor batch information

**Fields:**
- `organization_id` - Multi-tenancy
- `z_report_id` - Foreign key
- `batch_date` - When batch was submitted
- `batch_number` - Batch ID from processor
- `stored_sales_declined`, `stored_returns_declined` - Declined amounts
- `approved_total` - Total approved amount

#### `losses_reports` (Losses/Voids/Comps)
Records of losses: voids, comps, spills, discounts

**Fields:**
- `organization_id` - Multi-tenancy
- `z_report_id` - Foreign key
- `report_date` - Business date
- `voids_amount` - Voided transactions
- `comps_amount` - Complimentary items
- `spills_amount` - Spilled items
- `customer_acct_amount` - Customer account adjustments
- `discounts_amount` - Discounts given

### Employee Tables (Enhanced)

#### `employee_shifts` (Enhanced from original)
Now includes:
- `role` - Job role (bartender, barback, server, ambassador, etc.)
- `time_in` - Clock-in time
- `time_out` - Clock-out time

This allows linking server sales in Z reports to employee records.

## CSV Import Strategy

When importing Z reports as CSV:

1. **Main Z Report** → Create one `z_reports` row
2. **Sales by Category** → Create one `z_report_category_sales` row per category
3. **Sales by Department** → Create one `z_report_department_sales` row per dept
4. **Sales by Register** → Create one `z_report_register_sales` row per register
5. **Sales by Server** → Create one `z_report_server_sales` row per server (link to employees if name matches)
6. **Hourly Sales** → Create one `z_report_hourly_sales` row per hour slot
7. **Credit Card Details** → Create one `z_report_cc_types` row per card type
8. **CC Batch** → Create one `z_report_cc_batch` row
9. **Losses** → Create one `losses_reports` row

## Security & Access Control

### User-Level Access
- Users can only see data for organizations they're members of
- RLS policies enforce this at the database level
- No application-level security check required

### Organization-Level Access
- When importing data, specify the `organization_id`
- All related records (categories, departments, servers, etc.) inherit the same `organization_id`
- If `organization_id` doesn't match user's organizations, the insert fails (RLS)

### Audit Trail
- All tables have `created_at` and `updated_at` timestamps
- These track when records were created/modified
- Supabase audit logs track who made changes (if enabled)

## Example Queries

### Get all Z reports for Bar A in April 2026
```sql
SELECT * FROM z_reports
WHERE organization_id = 'bar-a-org-id'
AND report_date >= '2026-04-01'
AND report_date < '2026-05-01'
ORDER BY report_date DESC;
```

### Get server sales for a specific Z report
```sql
SELECT server_name, total_sales, cash_due, tips_paid_out
FROM z_report_server_sales
WHERE z_report_id = 'specific-z-report-id'
AND organization_id = 'bar-a-org-id'
ORDER BY total_sales DESC;
```

### Get category breakdown for a date range
```sql
SELECT z.report_date, c.category_name, c.sales_amount, c.sales_percentage
FROM z_reports z
JOIN z_report_category_sales c ON z.id = c.z_report_id
WHERE z.organization_id = 'bar-a-org-id'
AND z.report_date BETWEEN '2026-04-01' AND '2026-04-30'
ORDER BY z.report_date, c.sales_amount DESC;
```

### Find high-loss days
```sql
SELECT l.report_date, 
       (l.voids_amount + l.comps_amount + l.spills_amount) as total_loss
FROM losses_reports l
WHERE l.organization_id = 'bar-a-org-id'
ORDER BY total_loss DESC
LIMIT 10;
```

## Migration Execution

Run these migrations in Supabase in order:

1. `20260424000000_create_payroll_tables.sql` - Base tables (employees, shifts, basic Z report)
2. `20260424000001_expand_z_reports_schema.sql` - Detailed Z report tables

After running migrations:
- All tables are created with RLS enabled
- All policies are in place
- Data is isolated by organization
- Users can safely import data for their bar

## Scotty's On Vine Example Data

For the sample Z report from Scotty's On Vine (4/17-4/18/2026):

```
z_reports row:
- report_date: 2026-04-18
- z_report_number: 52
- total_transactions: 752
- subtotal: 7247.22
- tax: 563.96
- grand_total: 8379.74
- cash_sales: 1199.55
- credit_card_sales: 8279.39
- tips_paid_out: 1099.20
- dine_in_total: 7247.22
- cash_on_hand: 100.35

z_report_category_sales rows (11 categories):
- Cocktails: 655.12 (9.04%)
- Draft Beer: 484.00 (6.68%)
- Gin: 11.00 (0.15%)
- Rum: 262.35 (3.62%)
- Seltzers & Cans: 306.78 (4.23%)
- Shots: 2441.60 (33.69%)
- ... etc

z_report_server_sales rows (5 servers):
- Wes Berns: 1291.64 sales, 258.85 tips
- Grace Larschied: 1936.83 sales, 252.51 tips
- Steve Miick: 3503.45 sales, 414.85 tips
- Bar Owner: 15.29 sales, 2.00 tips
- Brendan Sitton: 1632.53 sales, 170.99 tips

z_report_hourly_sales rows (8 time slots):
- 19:00-19:59: 42.03 (0.58%)
- 20:00-20:59: 47.28 (0.65%)
- ... continuing through 03:00-03:59

losses_reports row:
- voids: 6.46
- comps: 0.00
- spills: 143.79
- discounts: 14.00
```

This data structure allows complete analysis of daily bar operations while ensuring Bar B (or any other organization) cannot see or access this data.
