import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { createAdminClient } from '@/lib/supabase/admin';
import { createFakeAdmin, type Call, type QueryCall, type RpcCall } from '@/lib/test/fake-admin';
import { encryptJSON } from '@/lib/direct-deposit/crypto';
import { runProviderSync } from '@/lib/pos/sync-run';
import { fromToastDate } from '@/lib/toast/client';
import * as fx from './__fixtures__/fixtures';

const NOW = new Date('2026-11-24T06:00:00Z'); // 01:00 local on the 24th: still the 23rd's business night
const cfg = {
  restaurant_guid: 'R-1', timezone: 'America/New_York', toast_closeout_hour: 4, last_sync_errors: ['old'],
};

type Opts = {
  secrets?: Record<string, unknown>; lease?: 'free' | 'held';
  status?: Record<string, number>; // path suffix -> status
  login?: number;
};

function world(o: Opts = {}) {
  const secrets = o.secrets ?? { client_id: 'cid', client_secret: 'sec', access_token: 'tok', token_expires_at: Date.now() + 3_600_000 };
  const requests: { path: string; search: URLSearchParams; auth: string | null; guid: string | null }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(u));
    const h = new Headers(init?.headers);
    requests.push({ path: url.pathname, search: url.searchParams, auth: h.get('authorization'), guid: h.get('toast-restaurant-external-id') });
    if (url.pathname.endsWith('/login')) {
      return o.login ? new Response('no', { status: o.login })
        : new Response(JSON.stringify({ token: { accessToken: 'tok-new', expiresIn: 86400 } }), { status: 200 });
    }
    const forced = Object.entries(o.status ?? {}).find(([k]) => url.pathname.endsWith(k));
    if (forced) return new Response('denied', { status: forced[1] });
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (url.pathname === '/orders/v2/ordersBulk') {
      if (url.searchParams.get('page') !== '1') return json([]);
      const bd = url.searchParams.get('businessDate');
      if (bd) return json(fx.orders.filter((x) => String(x.businessDate) === bd));
      return json(fx.orders.filter((x) => x.guid === 'O0' || x.guid === 'O11')); // the modified window
    }
    if (url.pathname === '/labor/v1/employees') return json(fx.employees);
    if (url.pathname === '/labor/v1/timeEntries') return json(fx.timeEntries[fromToastDate(Number(url.searchParams.get('businessDate')))!] ?? []);
    if (url.pathname === '/menus/v2/menus') return json(fx.menus);
    return new Response('?', { status: 404 });
  }));

  const fake = createFakeAdmin((c: Call) => {
    if ('rpc' in c) return { data: [] };
    if (c.table === 'organizations' && c.op === 'select') return { data: { id: 'org-1', pos_provider: 'toast', pos_config: cfg, bar_settings: {} } };
    if (c.table === 'pos_credentials' && c.op === 'select') {
      return { data: { provider: 'toast', external_id: 'R-1', secrets: encryptJSON(secrets), version: 1 } };
    }
    if (c.table === 'pos_credentials' && c.op === 'update' && c.filters.some((f) => f.startsWith('or '))) {
      return { data: o.lease === 'held' ? [] : [{ organization_id: 'org-1' }] };
    }
    if (c.table === 'pos_credentials' && c.op === 'update') return { data: [{ version: 2 }] };
    if (c.table === 'inventory_items' && c.op === 'select') {
      return { data: [{ id: 'inv-bud', name: 'Bud Light', bottle_size_ml: null, pour_size_oz: null, inventory_categories: null }] };
    }
    return undefined;
  });
  const admin = fake.client as unknown as ReturnType<typeof createAdminClient>;
  return { fake, admin, requests };
}

const q = (calls: Call[]) => calls.filter((c): c is QueryCall => 'table' in c);
// The applier splits rows that report cash tips from rows that do not, so a night's rows may be in either statement.
const zRows = (calls: Call[]) => q(calls).filter((c) => c.table === 'z_report_days' && c.op === 'upsert')
  .flatMap((c) => c.payload as Record<string, unknown>[])
  .sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));
const rpcs = (calls: Call[]) => calls.filter((c): c is RpcCall => 'rpc' in c);

beforeEach(() => {
  process.env.DD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  delete process.env.TOAST_API_HOST;
  delete process.env.TOAST_AMOUNTS_IN_CENTS;
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Toast end to end through the shared applier', () => {
  it('writes the nights, depletes stock once, and records a healthy outcome', async () => {
    const w = world();
    const r = await runProviderSync('org-1', { admin: w.admin, now: NOW });
    expect(r).toMatchObject({ ran: true, ok: true, needsReauth: false });

    const rows = zRows(w.fake.calls);
    expect(rows.map((x) => x.report_date)).toEqual(['2026-11-21', '2026-11-22', '2026-11-23']);
    expect(rows[0]).toMatchObject({ total_sales: 63, cc_tips: 7.4, cash_tips: 19.75, cash_sales: 26, card_sales: 37 });
    expect(rows[1]).not.toHaveProperty('cash_tips');
    expect(rows[2]).toMatchObject({ total_sales: 18.5, cc_tips: 2 }); // the old order's refund landed here

    const dep = rpcs(w.fake.calls).filter((c) => c.rpc === 'pos_apply_item_sales');
    // only Bud Light has an inventory match here, and it sold on the 21st
    expect(dep.map((c) => (c.args as { p_sale_date: string }).p_sale_date)).toEqual(['2026-11-21']);
    expect(JSON.stringify(dep[0].args)).toContain('inv-bud');

    const outcome = q(w.fake.calls).filter((c) => c.table === 'organizations' && c.op === 'update').at(-1)!;
    const next = (outcome.payload as { pos_config: Record<string, unknown> }).pos_config;
    expect(next).toMatchObject({ restaurant_guid: 'R-1', timezone: 'America/New_York', needs_reauth: false, last_sync_errors: [] });
    expect(next.last_sync_summary).toMatchObject({ zReports: 3 });
  });

  it('asks for each business date in the window, then the orders modified since it opened', async () => {
    const w = world();
    await runProviderSync('org-1', { admin: w.admin, now: NOW });
    const orders = w.requests.filter((r) => r.path === '/orders/v2/ordersBulk' && r.search.get('page') === '1');
    expect(orders.filter((r) => r.search.has('businessDate')).map((r) => r.search.get('businessDate'))).toEqual(['20261121', '20261122', '20261123']);
    const mod = orders.find((r) => r.search.has('startDate'))!;
    // the 21st at the 04:00 closeout, New York, is 09:00Z
    expect(mod.search.get('startDate')).toBe('2026-11-21T09:00:00.000+0000');
    expect(w.requests.every((r) => r.guid === 'R-1' && r.auth === 'Bearer tok')).toBe(true);
  });

  it('a re-run of the same window sends identical rows and identical depletion arguments', async () => {
    const run = async () => {
      const w = world();
      await runProviderSync('org-1', { admin: w.admin, now: NOW });
      const strip = (c: Call) => JSON.stringify('rpc' in c ? c.args : (c as QueryCall).payload, (k, v) => (k === 'updated_at' ? undefined : v));
      return {
        rpc: rpcs(w.fake.calls).map(strip),
        z: q(w.fake.calls).filter((c) => c.table === 'z_report_days' && c.op === 'upsert').map(strip),
        sales: q(w.fake.calls).filter((c) => c.table === 'pos_item_sales' && c.op === 'upsert').map(strip),
      };
    };
    const a = await run();
    const b = await run();
    expect(a.rpc.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });

  it('logs in when there is no cached token, and saves it for the next run', async () => {
    const w = world({ secrets: { client_id: 'cid', client_secret: 'sec' } });
    await runProviderSync('org-1', { admin: w.admin, now: NOW });
    expect(w.requests[0].path).toBe('/authentication/v1/authentication/login');
    expect(w.requests.filter((r) => r.path !== '/authentication/v1/authentication/login').every((r) => r.auth === 'Bearer tok-new')).toBe(true);
    expect(q(w.fake.calls).some((c) => c.table === 'pos_credentials' && c.op === 'update' && c.filters.includes('eq version=1'))).toBe(true);
  });

  it('a failed orders feed stores no Z for the window and says so', async () => {
    const w = world({ status: { ordersBulk: 400 } });
    const r = await runProviderSync('org-1', { admin: w.admin, now: NOW });
    expect(r).toMatchObject({ ran: true, ok: false });
    expect(q(w.fake.calls).some((c) => c.table === 'z_report_days' && c.op === 'upsert')).toBe(false);
    expect(r.ran && r.errors.join(' ')).toMatch(/api: toast orders/);
  });

  it('names the missing permission on a 403, and keeps the other feeds', async () => {
    const w = world({ status: { timeEntries: 403, employees: 403 } });
    const r = await runProviderSync('org-1', { admin: w.admin, now: NOW });
    expect(r).toMatchObject({ ran: true, ok: true });
    expect(q(w.fake.calls).filter((c) => c.table === 'employee_shifts' && c.op === 'upsert')).toHaveLength(0);
    expect(zRows(w.fake.calls)).toHaveLength(3);
    for (const row of zRows(w.fake.calls)) expect(row).not.toHaveProperty('cash_tips');

    const w2 = world({ status: { ordersBulk: 403 } });
    const r2 = await runProviderSync('org-1', { admin: w2.admin, now: NOW });
    expect(r2.ran && r2.errors.join(' ')).toMatch(/Orders read permission/);
  });

  it('keeps syncing, with an error on record, when only the menu feed fails', async () => {
    const w = world({ status: { menus: 400 } });
    const r = await runProviderSync('org-1', { admin: w.admin, now: NOW });
    expect(r).toMatchObject({ ran: true, ok: false });
    expect(r.ran && r.errors.join(' ')).toMatch(/api: toast menus/);
    expect(q(w.fake.calls).some((c) => c.table === 'z_report_days' && c.op === 'upsert')).toBe(true);
  });

  it('reports a rejected login as needs_reauth', async () => {
    const w = world({ secrets: { client_id: 'cid', client_secret: 'sec' }, login: 401 });
    const r = await runProviderSync('org-1', { admin: w.admin, now: NOW });
    expect(r).toMatchObject({ ran: true, ok: false, needsReauth: true });
    const outcome = q(w.fake.calls).filter((c) => c.table === 'organizations' && c.op === 'update').at(-1)!;
    expect((outcome.payload as { pos_config: Record<string, unknown> }).pos_config).toMatchObject({ needs_reauth: true });
  });

  it('a throttled login is a retry, not a reconnect', async () => {
    const w = world({ secrets: { client_id: 'cid', client_secret: 'sec' }, login: 429 });
    const r = await runProviderSync('org-1', { admin: w.admin, now: NOW });
    expect(r).toMatchObject({ ran: true, ok: false, needsReauth: false });
  });

  it('without a stored time zone and closeout hour the run fails loudly instead of guessing', async () => {
    const w = world();
    const noZone = createFakeAdmin((c) => {
      if ('table' in c && c.table === 'organizations' && c.op === 'select') return { data: { id: 'org-1', pos_provider: 'toast', pos_config: { restaurant_guid: 'R-1' }, bar_settings: {} } };
      if ('table' in c && c.table === 'pos_credentials' && c.op === 'update') return { data: [{ organization_id: 'org-1' }] };
      return undefined;
    });
    await expect(runProviderSync('org-1', { admin: noZone.client as unknown as ReturnType<typeof createAdminClient> })).rejects.toThrow(/time zone is not set/);
    expect(w.requests).toHaveLength(0);
  });

  it('does nothing while another run holds the lease', async () => {
    const w = world({ lease: 'held' });
    expect(await runProviderSync('org-1', { admin: w.admin, now: NOW })).toEqual({ ran: false, reason: 'already-running' });
    expect(w.requests).toHaveLength(0);
  });

  it('a history import leaves the live status alone and skips items and menus by default', async () => {
    const w = world();
    await runProviderSync('org-1', { admin: w.admin, now: NOW, from: '2026-11-21', to: '2026-11-21' });
    expect(q(w.fake.calls).some((c) => c.table === 'organizations' && c.op === 'update')).toBe(false);
    expect(rpcs(w.fake.calls)).toHaveLength(0);
    expect(w.requests.some((r) => r.path === '/menus/v2/menus')).toBe(false);
  });

  it('releases the lease even when the run fails', async () => {
    const w = world();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad request', { status: 400 })));
    await runProviderSync('org-1', { admin: w.admin, now: NOW });
    const last = q(w.fake.calls).filter((c) => c.table === 'pos_credentials' && c.op === 'update').at(-1)!;
    expect(last.payload).toEqual({ sync_lease_until: null });
  });
});
