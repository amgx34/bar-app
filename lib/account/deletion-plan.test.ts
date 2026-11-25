import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  planDeletion, DeletionRefused, confirmationMatches, ORG_TABLES, RETAINED_TABLES,
  DEFAULT_RETENTION, EXPORT_TABLES,
} from './deletion-plan';

const ORG = '00000000-0000-0000-0000-0000000000aa';
const names = (p: ReturnType<typeof planDeletion>) => p.steps.map((s) => s.table);

describe('planDeletion authorisation', () => {
  it('refuses a manager, accountant and staff', () => {
    for (const role of ['manager', 'accountant', 'staff', null]) {
      expect(() => planDeletion({ role, orgId: ORG })).toThrow(DeletionRefused);
    }
  });
  it('refuses when the caller has no membership in the target org (role null)', () => {
    expect(() => planDeletion({ role: null, orgId: ORG })).toThrow(DeletionRefused);
  });
  it('refuses an empty org id', () => {
    expect(() => planDeletion({ role: 'owner', orgId: '' })).toThrow(DeletionRefused);
  });
  it('plans for the owner', () => {
    expect(planDeletion({ role: 'owner', orgId: ORG }).orgId).toBe(ORG);
  });
});

describe('planDeletion coverage', () => {
  it('every org-scoped table is either deleted or explicitly retained under the default rule', () => {
    const p = planDeletion({ role: 'owner', orgId: ORG });
    const covered = new Set([...names(p), ...p.retained]);
    for (const t of ORG_TABLES) expect(covered.has(t.table), t.table).toBe(true);
  });
  it('delete-all removes everything, retaining nothing', () => {
    const p = planDeletion({ role: 'owner', orgId: ORG, retention: 'delete-all' });
    for (const t of ORG_TABLES) expect(names(p)).toContain(t.table);
    expect(p.retained).toEqual([]);
    expect(p.deleteOrgRow).toBe(true);
  });
  it('the default keeps payroll and tax records and the organization row, and says so', () => {
    expect(DEFAULT_RETENTION).toBe('keep-payroll-and-tax');
    const p = planDeletion({ role: 'owner', orgId: ORG });
    for (const t of ['payroll_runs', 'payroll_payouts', 'payroll_adjustments', 'z_report_days']) {
      expect(p.retained).toContain(t);
      expect(names(p)).not.toContain(t);
    }
    expect(p.deleteOrgRow).toBe(false);
  });
  it('bank details and credentials are never retained', () => {
    const p = planDeletion({ role: 'owner', orgId: ORG });
    for (const t of ['direct_deposit_accounts', 'pos_credentials', 'push_subscriptions', 'employee_accounts']) {
      expect(names(p)).toContain(t);
      expect(RETAINED_TABLES).not.toContain(t);
    }
  });
  it('tables that inherit tenancy go through their parent, and the parent is deleted after', () => {
    const p = planDeletion({ role: 'owner', orgId: ORG });
    const child = p.steps.find((s) => s.table === 'weigh_report_items')!;
    expect(child.via).toBe('parent');
    expect(child.parent).toBe('weigh_reports');
    expect(names(p).indexOf('weigh_report_items')).toBeLessThan(names(p).indexOf('weigh_reports'));
    const comp = p.steps.find((s) => s.table === 'pos_bundle_components')!;
    expect(comp.parent).toBe('pos_bundles');
    expect(names(p).indexOf('pos_bundle_components')).toBeLessThan(names(p).indexOf('pos_bundles'));
  });
  it('children are deleted before parents that restrict or are referenced', () => {
    const n = names(planDeletion({ role: 'owner', orgId: ORG }));
    const before = (a: string, b: string) => expect(n.indexOf(a), `${a} before ${b}`).toBeLessThan(n.indexOf(b));
    before('rep_orders', 'reps');
    before('usage_logs', 'inventory_shipments');
    before('usage_logs', 'inventory_items');
    before('z_report_category_sales', 'z_reports');
    before('dd_audit_log', 'dd_verification_codes');
  });
  it('memberships are removed last', () => {
    for (const retention of ['keep-payroll-and-tax', 'delete-all'] as const) {
      const p = planDeletion({ role: 'owner', orgId: ORG, retention });
      expect(p.steps[p.steps.length - 1].table).toBe('memberships');
      expect(names(p).filter((t) => t === 'memberships')).toHaveLength(1);
    }
  });
  it('every step is scoped to the org or to a parent that is', () => {
    for (const s of planDeletion({ role: 'owner', orgId: ORG }).steps) {
      if (s.via === 'parent') expect(s.parent && s.parentKey).toBeTruthy();
    }
  });
});

describe('every table in migrations that carries organization_id is classified', () => {
  it('has no unclassified tenant table', () => {
    const dir = path.join(process.cwd(), 'supabase', 'migrations');
    const found = new Set<string>();
    for (const f of fs.readdirSync(dir)) {
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      const re = /create table (?:if not exists )?(?:public\.)?([a-z_0-9]+)\s*\(([\s\S]*?)\n\);/gi;
      for (const m of sql.matchAll(re)) if (/organization_id/i.test(m[2])) found.add(m[1]);
    }
    const known = new Set([...ORG_TABLES.map((t) => t.table), 'organizations']);
    expect([...found].filter((t) => !known.has(t))).toEqual([]);
  });
});

describe('confirmationMatches', () => {
  it('needs the exact bar name, ignoring surrounding space only', () => {
    expect(confirmationMatches('  The Rail Bar ', 'The Rail Bar')).toBe(true);
    expect(confirmationMatches('the rail bar', 'The Rail Bar')).toBe(false);
    expect(confirmationMatches('', '')).toBe(false);
    expect(confirmationMatches('delete', 'The Rail Bar')).toBe(false);
  });
});

describe('export table list', () => {
  it('never includes secrets', () => {
    for (const t of ['direct_deposit_accounts', 'pos_credentials', 'push_subscriptions', 'dd_verification_codes', 'employee_accounts']) {
      expect(EXPORT_TABLES.map((e) => e.table)).not.toContain(t);
    }
  });
  it('covers payroll, sales and inventory', () => {
    const n = EXPORT_TABLES.map((e) => e.table);
    for (const t of ['inventory_items', 'usage_logs', 'z_report_days', 'payroll_runs', 'employees']) expect(n).toContain(t);
  });
});
