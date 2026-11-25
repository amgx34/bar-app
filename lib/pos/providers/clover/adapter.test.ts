import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { createAdminClient } from '@/lib/supabase/admin';
import { createFakeAdmin, type Call, type QueryCall, type RpcCall } from '@/lib/test/fake-admin';
import { encryptJSON } from '@/lib/direct-deposit/crypto';
import { runProviderSync } from '@/lib/pos/sync-run';
import * as fx from './__fixtures__/fixtures';

const NOW = new Date('2026-11-24T06:00:00Z'); // 01:00 local on the 24th: still the 23rd's night
const cfg = { merchant_id: 'M1', clover_region: 'na', timezone: 'America/New_York', cutoff_hour: 4, last_sync_errors: ['old'] };

type Opts = { secrets?: Record<string, unknown>; lease?: 'free' | 'held'; fail?: string; forbid?: string[] };

function world(o: Opts = {}) {
  const secrets = o.secrets ?? { access_token: 'tok', access_token_expiration: NOW.getTime() + 3_600_000, refresh_token: 'r1' };
  const requests: { path: string; auth: string | null; method: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(u));
    requests.push({ path: url.pathname, auth: new Headers(init?.headers).get('authorization'), method: init?.method ?? 'GET' });
    if (url.pathname === '/oauth/v2/refresh') {
      return new Response(JSON.stringify({ access_token: 'tok-new', access_token_expiration: NOW.getTime() + 3_600_000, refresh_token: 'r2' }), { status: 200 });
    }
    const feed = url.pathname.split('/').pop()!;
    if (o.fail === feed) return new Response('boom', { status: 400 });
    if (o.forbid?.includes(feed)) return new Response('no', { status: 403 });
    const all: Record<string, unknown[]> = {
      payments: fx.payments, refunds: fx.refunds, orders: fx.orders, employees: fx.employees, shifts: fx.shifts,
      items: [
        { id: 'i-bud', categories: { elements: [{ name: 'Beer' }] } },
        { id: 'i-marg', categories: { elements: [{ name: 'Cocktails' }] } },
      ],
    };
    const elements = Number(url.searchParams.get('offset')) === 0 ? (all[feed] ?? []) : [];
    return new Response(JSON.stringify({ elements }), { status: 200 });
  }));

  const fake = createFakeAdmin((c: Call) => {
    if ('rpc' in c) return { data: [] };
    if (c.table === 'organizations' && c.op === 'select') return { data: { id: 'org-1', pos_provider: 'clover', pos_config: cfg, bar_settings: {} } };
    if (c.table === 'pos_credentials' && c.op === 'select') {
      return { data: { provider: 'clover', external_id: 'M1', secrets: encryptJSON(secrets), version: 1 } };
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
const rpcs = (calls: Call[]) => calls.filter((c): c is RpcCall => 'rpc' in c);

beforeEach(() => {
  process.env.DD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.CLOVER_CLIENT_ID = 'cid';
  delete process.env.CLOVER_SANDBOX;
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Clover end to end through the shared applier', () => {
  it('writes the nights, depletes stock once, and records a healthy outcome', async () => {
    const w = world();
    const r = await runProviderSync('org-1', { admin: w.admin, now: NOW });
    expect(r).toMatchObject({ ran: true, ok: true, needsReauth: false });

    const z = q(w.fake.calls).find((c) => c.table === 'z_report_days' && c.op === 'upsert')!;
    const rows = z.payload as Record<string, unknown>[];
    expect(rows.map((x) => x.report_date)).toEqual(['2026-11-21', '2026-11-22', '2026-11-23']);
    expect(rows[0]).toMatchObject({ total_sales: 58, cc_tips: 8, cash_sales: 23.26, card_sales: 34.74 });
    expect(rows[0]).not.toHaveProperty('cash_tips'); // a counted jar is never touched

    const dep = rpcs(w.fake.calls).filter((c) => c.rpc === 'pos_apply_item_sales');
    expect(dep.map((c) => (c.args as { p_sale_date: string }).p_sale_date)).toEqual(['2026-11-21', '2026-11-22']);
    expect(JSON.stringify(dep[0].args)).toContain('inv-bud');

    const outcome = q(w.fake.calls).filter((c) => c.table === 'organizations' && c.op === 'update').at(-1)!;
    const next = (outcome.payload as { pos_config: Record<string, unknown> }).pos_config;
    expect(next).toMatchObject({ merchant_id: 'M1', timezone: 'America/New_York', needs_reauth: false, last_sync_errors: [] });
    expect(next.last_sync_summary).toMatchObject({ zReports: 3 });
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
    // The ledger (pos_stock_applications) turns identical arguments into a zero delta.
    expect(b).toEqual(a);
  });

  it('refreshes an expiring token before the first call, persists it, and uses it', async () => {
    const w = world({ secrets: { access_token: 'tok', access_token_expiration: NOW.getTime() + 30_000, refresh_token: 'r1' } });
    await runProviderSync('org-1', { admin: w.admin, now: NOW });
    expect(w.requests[0].path).toBe('/oauth/v2/refresh');
    expect(w.requests.slice(1).every((r) => r.auth === 'Bearer tok-new')).toBe(true);
    const save = q(w.fake.calls).find((c) => c.table === 'pos_credentials' && c.op === 'update' && c.filters.includes('eq version=1'))!;
    expect(save).toBeTruthy();
  });

  it('a failed required feed stores no Z for the window and says so', async () => {
    const w = world({ fail: 'refunds' });
    const r = await runProviderSync('org-1', { admin: w.admin, now: NOW });
    expect(r).toMatchObject({ ran: true, ok: false });
    expect(q(w.fake.calls).some((c) => c.table === 'z_report_days' && c.op === 'upsert')).toBe(false);
    expect(r.ran && r.errors.join(' ')).toMatch(/api: clover refunds/);
  });

  it('a 403 on shifts is not a fault, and the hours feed stays empty', async () => {
    const w = world({ forbid: ['shifts', 'employees'] });
    const r = await runProviderSync('org-1', { admin: w.admin, now: NOW });
    expect(r).toMatchObject({ ran: true, ok: true });
    const shifts = q(w.fake.calls).filter((c) => c.table === 'employee_shifts' && c.op === 'upsert');
    expect(shifts).toHaveLength(0);
  });

  it('reports a rejected login as needs_reauth', async () => {
    const w = world({ secrets: { access_token: 'tok', access_token_expiration: 1, refresh_token: 'r1' } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
    const r = await runProviderSync('org-1', { admin: w.admin, now: NOW });
    expect(r).toMatchObject({ ran: true, ok: false, needsReauth: true });
    const outcome = q(w.fake.calls).filter((c) => c.table === 'organizations' && c.op === 'update').at(-1)!;
    expect((outcome.payload as { pos_config: Record<string, unknown> }).pos_config).toMatchObject({ needs_reauth: true });
  });

  it('does nothing while another run holds the lease', async () => {
    const w = world({ lease: 'held' });
    expect(await runProviderSync('org-1', { admin: w.admin, now: NOW })).toEqual({ ran: false, reason: 'already-running' });
    expect(w.requests).toHaveLength(0);
  });

  it('a history import leaves the live status alone and skips items by default', async () => {
    const w = world();
    await runProviderSync('org-1', { admin: w.admin, now: NOW, from: '2026-11-21', to: '2026-11-21' });
    expect(q(w.fake.calls).some((c) => c.table === 'organizations' && c.op === 'update')).toBe(false);
    expect(rpcs(w.fake.calls)).toHaveLength(0);
    expect(w.requests.some((r) => r.path.endsWith('/orders'))).toBe(false);
  });

  it('releases the lease even when the run throws', async () => {
    const w = world();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await runProviderSync('org-1', { admin: w.admin, now: NOW });
    const last = q(w.fake.calls).filter((c) => c.table === 'pos_credentials' && c.op === 'update').at(-1)!;
    expect(last.payload).toEqual({ sync_lease_until: null });
  });
});
