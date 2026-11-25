import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { createFakeAdmin, type Call, type QueryCall, type Reply } from '@/lib/test/fake-admin';
import full from './__fixtures__/full.json';

/**
 * Characterization of POST /api/2touch/ingest.
 *
 * Pins what the route does today, statement by statement, so the shared applier
 * can be extracted from it without changing behaviour. The ordered call log and
 * the response are snapshotted; a few readable assertions state the rules the
 * snapshots exist to protect. If the log changes, the refactor is wrong, not
 * this file.
 */

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => holder.client }));

import { POST } from './route';

type Payload = Record<string, unknown>;
const TOKEN = 'org-token';

const org = {
  id: 'org-1',
  pos_provider: '2touch',
  pos_config: { agent_token: TOKEN, agent_version: '1.2.0', keep_me: true },
  bar_settings: { default_pour_oz: 1.5 },
};

type Overrides = (c: Call) => Reply | undefined;

function defaults(c: Call): Reply | undefined {
  if ('rpc' in c) return { data: [{ inventory_item_id: 'x' }] };
  switch (c.table) {
    case 'organizations':
      return c.op === 'select' ? { data: org } : undefined;
    case 'employees':
      return c.op === 'insert'
        ? { data: [{ id: 'e-bob', name: 'Bob' }] }
        : { data: [{ id: 'e-alice', name: 'Alice' }] };
    case 'pos_excluded_items':
      return { data: [{ match_key: 'happy hour deal' }] };
    case 'pos_bundles':
      return {
        data: [{
          id: 'b1', match_key: 'bucket of 5',
          pos_bundle_components: [{ inventory_item_id: 'i-bud', quantity: 5, unit: 'each' }],
        }],
      };
    case 'inventory_categories':
      return { data: [{ id: 'c-spirits', name: 'Spirits' }, { id: 'c-beer', name: 'Beer' }] };
    case 'inventory_items':
      return c.op === 'select'
        ? {
            data: [
              { id: 'i-titos', name: "Tito's", bottle_size_ml: 750, pour_size_oz: 1.5, inventory_categories: { default_pour_oz: null } },
              { id: 'i-bud', name: 'Bud Light', bottle_size_ml: null, pour_size_oz: null, inventory_categories: null },
            ],
          }
        : undefined;
  }
  return undefined;
}

async function post(payload: Payload, over: Overrides = () => undefined, opts: { sig?: string; raw?: string } = {}) {
  const fake = createFakeAdmin((c) => over(c) ?? defaults(c));
  holder.client = fake.client;
  const body = opts.raw ?? JSON.stringify(payload);
  const sig = opts.sig ?? createHmac('sha256', TOKEN).update(body).digest('hex');
  const res = await POST(new NextRequest('http://localhost/api/2touch/ingest', {
    method: 'POST',
    body,
    headers: { 'x-rail-signature': sig, 'x-rail-agent': 'rail-2touch-agent/1.4.0 (dotnet)' },
  }));
  return { status: res.status, json: await res.json(), calls: fake.calls };
}

const q = (calls: Call[], table: string, op: string) =>
  calls.filter((c): c is QueryCall => 'table' in c && c.table === table && c.op === op);
const orgWrites = (calls: Call[]) => q(calls, 'organizations', 'update').map((c) => (c.payload as { pos_config: Record<string, unknown> }).pos_config);

const pick = (keys: string[]): Payload =>
  Object.fromEntries(Object.entries(full).filter(([k]) => ['org_id', 'source', 'pulledAt', ...keys].includes(k)));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-21T12:00:00.000Z'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('2touch ingest, authentication and shape', () => {
  it('rejects a bad signature before writing anything', async () => {
    const r = await post(full, undefined, { sig: 'nope' });
    expect(r.status).toBe(401);
    expect(r.json).toEqual({ error: 'Unauthorized' });
    expect(r.calls.filter((c) => 'table' in c && c.op !== 'select')).toEqual([]);
  });

  it('rejects invalid JSON and a missing org_id', async () => {
    expect((await post({}, undefined, { raw: '{nope' })).json).toEqual({ error: 'Invalid JSON' });
    const r = await post({ source: 'x' });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ error: 'org_id required in payload' });
  });
});

describe('2touch ingest, full payload', () => {
  it('writes every feed in a fixed order', async () => {
    const r = await post(full);
    expect(r.status).toBe(200);
    expect(r.json).toMatchSnapshot('response');
    expect(r.calls).toMatchSnapshot('calls');
  });

  it('writes pos_config twice and the second write keeps the version the first stored', async () => {
    const r = await post(full);
    const [first, second] = orgWrites(r.calls);
    expect(first.agent_version).toBe('1.4.0');
    expect(second.agent_version).toBe('1.4.0');
    expect(second.keep_me).toBe(true);
    expect(second.last_sync_errors).toEqual(['agent: items feed: bad mapping']);
  });

  it('rounds money to cents and sends an absent split as null', async () => {
    const r = await post(full);
    const rows = q(r.calls, 'z_report_days', 'upsert')[0].payload as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ total_sales: 4521.51, cash_sales: 1200.25, card_sales: 3321.26 });
    expect(rows[1]).toMatchObject({ cash_sales: null, card_sales: null, cash_tips: 5, cash_tips_source: 'pos' });
  });

  it('never creates a bundle or an excluded deal as inventory, and depletes by delta through the RPC', async () => {
    const r = await post(full);
    const created = q(r.calls, 'inventory_items', 'upsert')[0].payload as { name: string }[];
    expect(created.map((i) => i.name).sort()).toEqual(['Bud Light', "TITO'S"]);
    const rpc = r.calls.filter((c) => 'rpc' in c);
    expect(rpc).toHaveLength(1);
    expect(rpc[0]).toMatchObject({ rpc: 'pos_apply_item_sales' });
  });
});

describe('2touch ingest, guards', () => {
  it('manual cash tips freeze the figure and the source', async () => {
    const r = await post(full, (c) =>
      'table' in c && c.table === 'z_report_days' && c.op === 'select'
        ? { data: [{ report_date: '2026-11-20', cash_tips: 55, cash_tips_source: 'manual' }] }
        : undefined);
    const rows = q(r.calls, 'z_report_days', 'upsert')[0].payload as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ cash_tips: 55, cash_tips_source: 'manual' });
    expect(rows[1]).toMatchObject({ cash_tips: 5, cash_tips_source: 'pos' });
    expect(r.calls).toMatchSnapshot('calls');
  });

  it('manual hours are skipped and counted as protected', async () => {
    const r = await post(full, (c) =>
      'table' in c && c.table === 'employee_shifts' && c.op === 'select'
        ? { data: [{ employee_id: 'e-alice', shift_date: '2026-11-20' }] }
        : undefined);
    const shifts = q(r.calls, 'employee_shifts', 'upsert')[0].payload as { employee_id: string }[];
    expect(shifts.map((s) => s.employee_id)).toEqual(['e-bob']);
    expect(r.json.shiftsProtected).toBe(1);
    expect(r.calls).toMatchSnapshot('calls');
  });

  it('a failed manual-hours lookup writes no shifts and reports the error', async () => {
    const r = await post(full, (c) =>
      'table' in c && c.table === 'employee_shifts' && c.op === 'select'
        ? { error: { message: 'boom' } }
        : undefined);
    expect(q(r.calls, 'employee_shifts', 'upsert')).toEqual([]);
    expect(r.json.errors).toContain('employee_shifts manual lookup: boom');
  });
});

describe('2touch ingest, items', () => {
  it('an excluded item never reaches inventory or sales', async () => {
    const r = await post(pick(['itemAudit']));
    const facts = q(r.calls, 'pos_item_sales', 'upsert')[0].payload as { item_name: string }[];
    expect(facts.map((f) => f.item_name)).not.toContain('Happy  Hour Deal');
    expect(r.json.itemAuditSkipped).toBe(1);
    expect(r.calls).toMatchSnapshot('calls');
  });

  it('a bundle sale is expanded into component stock and not created as an item', async () => {
    const r = await post({
      ...pick([]),
      itemAudit: [{ sale_date: '2026-11-20', item_name: 'Bucket of 5', category_name: 'Deals', qty_sold: 2, net_sales: 30 }],
    });
    expect(r.json.bundlesExpanded).toBe(1);
    expect(q(r.calls, 'inventory_items', 'upsert')).toEqual([]);
    expect(r.calls).toMatchSnapshot('calls');
  });

  it('one failing day does not stop the others and the error is reported', async () => {
    const two = {
      ...pick([]),
      itemAudit: [
        { sale_date: '2026-11-19', item_name: 'Bud Light', category_name: 'Beer', qty_sold: 1, net_sales: 5 },
        { sale_date: '2026-11-20', item_name: 'Bud Light', category_name: 'Beer', qty_sold: 2, net_sales: 10 },
      ],
    };
    const r = await post(two, (c) =>
      'rpc' in c && (c.args as { p_sale_date: string }).p_sale_date === '2026-11-19'
        ? { error: { message: 'rpc down' } }
        : undefined);
    expect(r.calls.filter((c) => 'rpc' in c)).toHaveLength(2);
    expect(r.json.errors).toEqual(['pos_apply_item_sales(2026-11-19): rpc down']);
    expect(r.json.stockMoved).toBe(1);
  });
});

describe('2touch ingest, hourly and servers', () => {
  it('a failed delete skips that night only and never inserts on top', async () => {
    const r = await post(full, (c) =>
      'table' in c && c.table === 'pos_hourly_sales' && c.op === 'delete'
        ? { error: { message: 'locked' } }
        : undefined);
    expect(q(r.calls, 'pos_hourly_sales', 'insert')).toEqual([]);
    expect(q(r.calls, 'pos_server_sales', 'insert')).toHaveLength(1);
    expect(r.json.errors).toContain('pos_hourly_sales delete(2026-11-20): locked');
    expect(r.calls).toMatchSnapshot('calls');
  });
});

describe('2touch ingest, sync status', () => {
  it('a backfill writes its data but leaves last_sync_* alone', async () => {
    const r = await post({ ...full, backfill: true });
    expect(orgWrites(r.calls)).toHaveLength(1); // the version only
    expect(orgWrites(r.calls)[0]).not.toHaveProperty('last_sync_at');
    expect(q(r.calls, 'z_report_days', 'upsert')).toHaveLength(1);
    expect(r.calls).toMatchSnapshot('calls');
  });

  it('an old agent sending only z, ew and items still succeeds with a null split and no hourly work', async () => {
    const r = await post({
      ...pick(['zReports', 'ewReports', 'itemAudit']),
      zReports: [{ report_date: '2026-11-20', total_sales: 100, cc_tips: 1, cash_tips: 2 }],
    });
    expect(r.status).toBe(200);
    expect(q(r.calls, 'pos_hourly_sales', 'delete')).toEqual([]);
    expect(orgWrites(r.calls).at(-1)?.last_sync_summary).toMatchObject({ hoursRecorded: 0, serversRecorded: 0 });
    expect(r.json).toMatchSnapshot('response');
    expect(r.calls).toMatchSnapshot('calls');
  });

  it('truncates agent errors to five of 300 characters and prefixes them', async () => {
    const r = await post({ ...pick([]), agentErrors: Array.from({ length: 7 }, () => 'x'.repeat(400)) });
    expect(r.json.errors).toHaveLength(5);
    expect((r.json.errors as string[])[0]).toBe(`agent: ${'x'.repeat(300)}`);
  });
});
