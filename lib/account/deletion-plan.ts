/**
 * What closing a bar deletes, in what order, and what it keeps.
 *
 * Pure: no database in here. `delete-org.ts` executes the plan, and the test
 * scans supabase/migrations so a new tenant table cannot ship unclassified.
 *
 * Retention default: payroll and sales-tax records are KEPT. The owner has not
 * had counsel confirm a retention period, and wages paid and sales reported are
 * what tax law most commonly makes a business hold. Keeping them means the
 * organization row stays (every one of those tables cascades from it), so the
 * bar is closed rather than erased: nobody can sign in to it, and everything
 * operational and personal (bank details, tokens, devices, inventory, vendors,
 * messages) is deleted. The UI says this in plain words. `delete-all` exists
 * for when counsel says the records need not be kept.
 */

export type Retention = 'keep-payroll-and-tax' | 'delete-all';
export const DEFAULT_RETENTION: Retention = 'keep-payroll-and-tax';

export type TableRule = {
  table: string;
  /** 'org' filters on organization_id; 'parent' has no tenancy of its own. */
  via: 'org' | 'parent';
  parent?: string;
  /** Column on this table pointing at the parent's id. */
  parentKey?: string;
  /** Kept under the default retention rule. */
  retain?: boolean;
  /** Left out of the owner's export (secrets, devices, alerts). */
  noExport?: boolean;
};

const org = (table: string, extra: Partial<TableRule> = {}): TableRule => ({ table, via: 'org', ...extra });
const kid = (table: string, parent: string, parentKey: string, extra: Partial<TableRule> = {}): TableRule =>
  ({ table, via: 'parent', parent, parentKey, ...extra });

/**
 * Deletion order: children before the rows they reference.
 * rep_orders -> reps is RESTRICT; usage_logs references shipments and items.
 */
export const ORG_TABLES: TableRule[] = [
  // POS-derived
  org('pos_stock_applications'),
  kid('pos_bundle_components', 'pos_bundles', 'bundle_id'),
  org('pos_bundles'),
  org('pos_item_sales'),
  org('pos_excluded_items'),
  org('pos_size_tokens'),
  org('pos_hourly_sales'),
  org('pos_server_sales'),
  org('pos_credentials', { noExport: true }),
  // Inventory
  org('usage_logs'),
  org('inventory_shipments'),
  kid('weigh_report_items', 'weigh_reports', 'weigh_report_id'),
  org('weigh_reports'),
  org('rep_orders'),
  org('bar_messages'),
  org('reps'),
  org('inventory_items'),
  org('inventory_categories'),
  org('operating_expenses'),
  // Z reports (z_report_days is the nightly total: retained)
  org('losses_reports'),
  org('z_report_category_sales'),
  org('z_report_department_sales'),
  org('z_report_register_sales'),
  org('z_report_server_sales'),
  org('z_report_hourly_sales'),
  org('z_report_cc_types'),
  org('z_report_cc_batch'),
  org('z_reports'),
  org('z_report_server_tips', { retain: true }),
  org('z_report_days', { retain: true }),
  // Direct deposit: bank details are never kept
  org('dd_audit_log', { noExport: true }),
  org('dd_verification_codes', { noExport: true }),
  org('direct_deposit_accounts', { noExport: true }),
  // People and devices
  org('employee_accounts', { noExport: true }),
  org('notifications', { noExport: true }),
  org('notification_preferences', { noExport: true }),
  org('push_subscriptions', { noExport: true }),
  // Payroll: retained
  org('payroll_payouts', { retain: true }),
  org('payroll_runs', { retain: true }),
  org('payroll_adjustments', { retain: true }),
  org('employee_shifts', { retain: true }),
  org('employees', { retain: true }),
  // Records about the account itself
  org('terms_acceptances', { retain: true, noExport: true }),
  org('org_billing', { retain: true, noExport: true }),
];

export const RETAINED_TABLES = ORG_TABLES.filter((t) => t.retain).map((t) => t.table);
export const EXPORT_TABLES = ORG_TABLES.filter((t) => !t.noExport);

export class DeletionRefused extends Error {}

export type DeletionPlan = {
  orgId: string;
  steps: TableRule[];
  retained: string[];
  /** True only for delete-all: the organizations row itself goes. */
  deleteOrgRow: boolean;
};

/**
 * `role` is the caller's role IN the target org (null when they have no
 * membership there). Only an owner may close a bar.
 */
export function planDeletion(input: { role: string | null; orgId: string; retention?: Retention }): DeletionPlan {
  if (!input.orgId) throw new DeletionRefused('No organization given.');
  if (input.role !== 'owner') throw new DeletionRefused('Only the owner can close a bar.');
  const retention = input.retention ?? DEFAULT_RETENTION;
  const keep = retention === 'keep-payroll-and-tax';
  const steps = ORG_TABLES.filter((t) => !(keep && t.retain));
  // Memberships last: until the data is gone the owner can still sign in and retry.
  steps.push(org('memberships'));
  return {
    orgId: input.orgId,
    steps,
    retained: keep ? [...RETAINED_TABLES] : [],
    deleteOrgRow: !keep,
  };
}

/** Typed confirmation: the exact bar name. Case matters; edge whitespace does not. */
export function confirmationMatches(typed: string, orgName: string): boolean {
  const want = orgName.trim();
  return want.length > 0 && typed.trim() === want;
}
