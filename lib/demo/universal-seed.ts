/**
 * Creates or refreshes the permanent sample bars. One code path for the
 * `npm run demo:seed` command and the daily cron.
 *
 * Idempotent: the user, orgs and memberships are found by email and slug; each
 * bar's generated rows are deleted by organization_id and written again, so a
 * second run leaves the same bars with dates moved up to today. Takes the client
 * as an argument so the command can build its own (no Next.js alias needed).
 * Every statement filters or sets organization_id.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { buildUniversalBars, UNIVERSAL_EMAIL, type BarPlan } from './universal.ts';
import { TERMS_VERSION } from '../legal.ts';

export type SeedReport = { dryRun: boolean; user: string; bars: { slug: string; rows: Record<string, number> }[]; notes: string[] };

// Child tables, children before parents, so every delete respects its foreign keys.
const WIPE = [
  'notifications', 'bar_messages', 'rep_orders', 'payroll_payouts', 'payroll_adjustments', 'payroll_runs',
  'usage_logs', 'inventory_shipments', 'pos_stock_applications', 'employee_shifts', 'z_report_server_tips',
  'z_report_days', 'pos_hourly_sales', 'pos_server_sales', 'operating_expenses', 'employees',
  'inventory_items', 'reps', 'inventory_categories',
] as const;

export async function refreshUniversalDemo(
  db: SupabaseClient,
  opts: { now?: Date; dryRun?: boolean; password?: string } = {},
): Promise<SeedReport> {
  const now = opts.now ?? new Date();
  const dryRun = !!opts.dryRun;
  const plans = buildUniversalBars(now);
  const notes: string[] = [];
  const report: SeedReport = { dryRun, user: UNIVERSAL_EMAIL, bars: [], notes };

  if (dryRun) {
    for (const b of plans) report.bars.push({ slug: b.org.slug, rows: countRows(b) });
    notes.push('Dry run: nothing was written.');
    return report;
  }

  const userId = await ensureUser(db, opts.password, notes);
  // admin-scope-ok: terms_acceptances is keyed by user id, not by organisation.
  await check('terms_acceptances', db.from('terms_acceptances')
    .upsert({ user_id: userId, terms_version: TERMS_VERSION }, { onConflict: 'user_id,terms_version', ignoreDuplicates: true }));

  for (const b of plans) report.bars.push({ slug: b.org.slug, rows: await writeBar(db, userId, b, now) });
  return report;
}

function countRows(b: BarPlan): Record<string, number> {
  return {
    inventory_items: b.items.length, employees: b.employees.length, z_report_days: b.nights.length,
    employee_shifts: b.shifts.length, pos_hourly_sales: b.hourly.length, pos_server_sales: b.serverSales.length,
    usage_logs: b.movements.length + (b.shipment?.lines.length ?? 0), inventory_shipments: b.shipment ? 1 : 0,
    payroll_runs: b.payrollRun ? 1 : 0, rep_orders: b.repOrders.length, bar_messages: b.messages.length,
    operating_expenses: b.expenses.length, notifications: b.notifications.length,
  };
}

async function check(what: string, q: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await q;
  if (error) throw new Error(`Demo seed failed on ${what}: ${error.message}`);
}

async function ensureUser(db: SupabaseClient, password: string | undefined, notes: string[]): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Demo seed could not list users: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === UNIVERSAL_EMAIL);
    if (hit) {
      if (password) await db.auth.admin.updateUserById(hit.id, { password });
      return hit.id;
    }
    if (data.users.length < 200) break;
  }
  const { data, error } = await db.auth.admin.createUser({
    email: UNIVERSAL_EMAIL, email_confirm: true, password: password ?? randomBytes(32).toString('base64url'),
  });
  if (error || !data.user) throw new Error(`Demo seed could not create the demo user: ${error?.message}`);
  if (!password) notes.push('Created the demo user with a random password nobody has. Set DEMO_USER_PASSWORD and run again to set a known one.');
  return data.user.id;
}

async function writeBar(db: SupabaseClient, userId: string, b: BarPlan, now: Date): Promise<Record<string, number>> {
  const rows: Record<string, number> = {};
  const ins = async <T extends { id: string }>(table: string, data: object[], cols = 'id'): Promise<T[]> => {
    if (!data.length) return [];
    // admin-scope-ok: every row in `data` carries this bar's organization_id (set below).
    const { data: out, error } = await db.from(table).insert(data).select(cols);
    if (error) throw new Error(`Demo seed failed on ${table}: ${error.message}`);
    rows[table] = (rows[table] ?? 0) + data.length;
    return (out ?? []) as unknown as T[];
  };

  // ── Organization ─────────────────────────────────────────────────────────
  const { data: found } = await db.from('organizations').select('id').eq('slug', b.org.slug).maybeSingle();
  let orgId = found?.id as string | undefined;
  if (orgId) await check('organizations', db.from('organizations').update(b.org).eq('id', orgId));
  else {
    const { data, error } = await db.from('organizations').insert({ ...b.org, created_by: userId }).select('id').single();
    if (error || !data) throw new Error(`Demo seed failed on organizations: ${error?.message}`);
    orgId = data.id as string;
  }
  const org = orgId;
  const { data: mem } = await db.from('memberships').select('id').eq('organization_id', org).eq('user_id', userId).maybeSingle();
  if (mem) await check('memberships', db.from('memberships').update({ role: b.role }).eq('id', mem.id).eq('organization_id', org));
  else await check('memberships', db.from('memberships').insert({ user_id: userId, organization_id: org, role: b.role }));

  // ── Wipe what a previous run generated ───────────────────────────────────
  // weigh_report_items has no organization_id of its own: verify the parent, then delete through it.
  const { data: reports } = await db.from('weigh_reports').select('id').eq('organization_id', org);
  const reportIds = (reports ?? []).map((r) => r.id as string);
  if (reportIds.length) await check('weigh_report_items', db.from('weigh_report_items').delete().in('weigh_report_id', reportIds));
  await check('weigh_reports', db.from('weigh_reports').delete().eq('organization_id', org));
  for (const t of WIPE) await check(t, db.from(t).delete().eq('organization_id', org));

  const o = { organization_id: org };

  // ── Catalogue ────────────────────────────────────────────────────────────
  const cats = await ins<{ id: string; name: string }>('inventory_categories', b.categories.map((c) => ({ ...o, ...c })), 'id, name');
  const catId = new Map(cats.map((c) => [c.name, c.id]));
  const reps = await ins<{ id: string; name: string }>('reps', b.reps.map((r) => ({ ...o, ...r })), 'id, name');
  const repId = new Map(reps.map((r) => [r.name, r.id]));
  const items = await ins<{ id: string; name: string }>('inventory_items', b.items.map((i) => ({
    ...o, name: i.name, category_id: catId.get(i.category) ?? null, rep_id: repId.get(i.rep_name) ?? null, unit: i.unit,
    current_stock: i.current_stock, par_level: i.par_level, cost_price: i.cost_price, sale_price: i.sale_price, sku: i.sku,
    bottle_size_ml: i.bottle_size_ml, pour_size_oz: i.pour_size_oz,
  })), 'id, name');
  const itemId = new Map(items.map((i) => [i.name, i.id]));
  const emps = await ins<{ id: string; name: string }>('employees', b.employees.map((e) => ({ ...o, ...e })), 'id, name');
  const empId = new Map(emps.map((e) => [e.name, e.id]));

  // ── Shipment first, so its lines can carry shipment_id ───────────────────
  const logs = b.movements.filter((m) => itemId.has(m.item)).map((m) => ({
    ...o, item_id: itemId.get(m.item), quantity: m.quantity, reason: m.reason, note: m.note, logged_at: m.logged_at,
  }));
  if (b.shipment) {
    const s = b.shipment;
    const [ship] = await ins<{ id: string }>('inventory_shipments', [{
      ...o, rep_id: repId.get(s.rep_name) ?? null, vendor_name: s.vendor_name, invoice_number: s.invoice_number,
      invoice_date: s.invoice_date, received_date: s.received_date, freight: s.freight, tax: s.tax, other_charges: 0, deposits: 0,
      invoice_total: s.invoice_total, notes: 'Weekly delivery', source: 'manual',
    }]);
    for (const l of s.lines) {
      logs.push({ ...o, item_id: itemId.get(l.item), quantity: l.quantity, reason: 'delivery', note: `Invoice ${s.invoice_number}`, logged_at: s.logged_at, shipment_id: ship.id, unit_cost: l.unit_cost } as never);
    }
  }
  await ins('usage_logs', logs);

  // ── Sales, tips, hours ───────────────────────────────────────────────────
  await ins('z_report_days', b.nights.map((n) => ({
    ...o, report_date: n.date, total_sales: n.sales, cash_tips: n.cashTips, cc_tips: n.ccTips,
    cash_sales: n.cashSales, card_sales: n.cardSales, cash_tips_source: n.cashTipsSource,
  })));
  await ins('z_report_server_tips', b.nights.flatMap((n) => n.servers.map((s) => ({
    ...o, report_date: n.date, employee_name: s.name, total_sales: s.sales, tips_paid_out: s.tips,
  }))));
  await ins('pos_hourly_sales', b.hourly.map((h) => ({ ...o, ...h })));
  await ins('pos_server_sales', b.serverSales.map((s) => ({ ...o, ...s, employee_id: empId.get(s.server_name) ?? null })));
  await ins('employee_shifts', b.shifts.filter((s) => empId.has(s.employee)).map((s) => ({
    ...o, employee_id: empId.get(s.employee), shift_date: s.date, regular_hours: s.regular_hours, overtime_hours: s.overtime_hours, hourly_rate: null,
  })));

  // ── Payroll ──────────────────────────────────────────────────────────────
  if (b.payrollRun) {
    const r = b.payrollRun;
    const snapshot = r.snapshot.map((e) => ({ ...e, employeeId: empId.get(e.employeeName) }));
    await ins('payroll_runs', [{
      ...o, period_start: r.period_start, period_end: r.period_end, status: r.status, snapshot,
      submitted_by: userId, submitted_at: new Date(now.getTime() - 36e5).toISOString(),
      ...(r.status === 'approved' ? { reviewed_by: userId, reviewed_at: new Date(now.getTime() - 18e5).toISOString() } : {}),
    }]);
  }
  if (b.adjustment && empId.has(b.adjustment.employee)) {
    const a = b.adjustment;
    await ins('payroll_adjustments', [{ ...o, shift_date: a.shift_date, kind: 'hours', employee_id: empId.get(a.employee), hours_before: a.hours_before, hours_after: a.hours_after, reason: a.reason, created_by: userId }]);
  }
  if (b.payout && empId.has(b.payout.employee)) {
    const p = b.payout;
    await ins('payroll_payouts', [{ ...o, employee_id: empId.get(p.employee), period_start: p.period_start, period_end: p.period_end, method: p.method, amount_paid: p.amount_paid, paid_at: p.paid_at, marked_by: userId, idempotency_key: crypto.randomUUID() }]);
  }

  // ── Reps, books, notifications ───────────────────────────────────────────
  await ins('rep_orders', b.repOrders.map((r) => ({
    ...o, rep_id: repId.get(r.rep), po_number: r.po_number, delivery_date: r.delivery_date, notes: r.notes,
    status: r.status, send_email: true, send_sms: false, items: r.items, created_at: r.created_at,
  })));
  await ins('bar_messages', b.messages.map((m) => ({ ...o, ...m })));
  await ins('operating_expenses', b.expenses.map((e) => ({ ...o, ...e })));
  // The same user belongs to all three bars, so keys are already per bar (see universal.ts).
  // admin-scope-ok: notifications is wiped by organization_id above, and every row below carries it.
  await ins('notifications', b.notifications.map((n) => ({ ...o, user_id: userId, ...n })));

  // ── One weigh report, so the count screen has history ────────────────────
  const [wr] = await ins<{ id: string }>('weigh_reports', [{ ...o, report_date: b.nights.at(-1)?.date ?? b.today, shift: 'closing', notes: 'Closing weigh' }]);
  const spirits = b.items.filter((i) => i.category === 'Spirits' && i.bottle_size_ml).slice(0, 4);
  // weigh_report_items inherits tenancy through weigh_reports (`wr`, created above for this org).
  await check('weigh_report_items', db.from('weigh_report_items').insert(spirits.map((i, k) => ({
    weigh_report_id: wr.id, inventory_item_id: itemId.get(i.name), item_name: i.name, bottle_size_ml: i.bottle_size_ml,
    pour_size_oz: i.pour_size_oz, cost_price: i.cost_price, opening_level: 1, closing_level: 0.8 - k * 0.1, full_bottles_opened: 0,
  }))));
  rows.weigh_report_items = spirits.length;

  return rows;
}
