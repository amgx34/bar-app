/* eslint-disable @typescript-eslint/no-explicit-any -- tests drive a fake, untyped Supabase client */
import { describe, it, expect, vi } from 'vitest';
import { guardClient, isUniversalDemoEmail, DEMO_REFUSAL, assertNotDemo, blocksDemoApiWrite } from './write-guard';

// A tiny stand-in for a postgrest builder: chainable, only runs when awaited.
function fakeClient(log: string[]) {
  const builder = (op: string): any => {
    const b: any = {
      eq: () => b, select: () => b, single: () => b,
      then: (res: (v: unknown) => unknown) => { log.push(op); return Promise.resolve({ data: [{ id: 1 }], error: null }).then(res); },
    };
    return b;
  };
  return {
    from: (t: string) => ({
      select: () => builder(`select ${t}`), insert: () => builder(`insert ${t}`), update: () => builder(`update ${t}`),
      upsert: () => builder(`upsert ${t}`), delete: () => builder(`delete ${t}`),
    }),
    rpc: (n: string) => builder(`rpc ${n}`),
    auth: {
      signInWithPassword: async () => { log.push('signIn'); return { error: null }; },
      updateUser: async () => { log.push('updateUser'); return { error: null }; },
      admin: { createUser: async () => { log.push('createUser'); return { error: null }; }, getUserById: async () => { log.push('getUserById'); return { data: {} }; } },
    },
  } as any;
}

describe('guardClient for a demo request', () => {
  const setup = () => { const log: string[] = []; return { log, c: guardClient(fakeClient(log), async () => true) }; };

  it.each(['insert', 'update', 'upsert', 'delete'])('refuses %s without touching the table, with the calm sentence', async (op) => {
    const { log, c } = setup();
    const r = await (c.from('inventory_items') as any)[op]({}).eq('organization_id', 'o').select().single();
    expect(r.data).toBeNull();
    expect(r.error.message).toBe(DEMO_REFUSAL);
    expect(log).toEqual([]);
  });
  it('refuses a plain await of the mutation too', async () => {
    const { c } = setup();
    expect((await (c.from('t') as any).insert({})).error.message).toBe(DEMO_REFUSAL);
  });
  it('lets reads through', async () => {
    const { log, c } = setup();
    const r = await (c.from('t') as any).select('*').eq('organization_id', 'o');
    expect(r.error).toBeNull();
    expect(log).toEqual(['select t']);
  });
  it('refuses every rpc except the known non-org ones (fail closed)', async () => {
    const { log, c } = setup();
    for (const n of ['pos_apply_item_sales', 'inventory_apply_count', 'dd_commit_account', 'dd_delete_account', 'brand_new_rpc'])
      expect(((await (c as any).rpc(n)) as any).error.message).toBe(DEMO_REFUSAL);
    await (c as any).rpc('rate_limit_hit');
    expect(log).toEqual(['rpc rate_limit_hit']);
  });
  it('refuses auth changes but allows sign in and reading users', async () => {
    const { log, c } = setup();
    expect((await c.auth.updateUser({})).error.message).toBe(DEMO_REFUSAL);
    expect((await c.auth.admin.createUser({})).error.message).toBe(DEMO_REFUSAL);
    await c.auth.signInWithPassword({});
    await c.auth.admin.getUserById('x');
    expect(log).toEqual(['signIn', 'getUserById']);
  });
});

describe('guardClient for a normal request', () => {
  it('passes every write straight through', async () => {
    const log: string[] = [];
    const c = guardClient(fakeClient(log), async () => false);
    await (c.from('t') as any).insert({}); await (c as any).rpc('pos_apply_item_sales'); await c.auth.updateUser({});
    expect(log).toEqual(['insert t', 'rpc pos_apply_item_sales', 'updateUser']);
  });
});

describe('fails closed', () => {
  it('refuses when the demo check itself throws', async () => {
    const log: string[] = [];
    const c = guardClient(fakeClient(log), async () => { throw new Error('boom'); });
    expect(((await (c.from('t') as any).delete()) as any).error.message).toBe(DEMO_REFUSAL);
    expect(log).toEqual([]);
  });
});

describe('assertNotDemo', () => {
  it('throws the sentence for a demo request and is silent otherwise', async () => {
    await expect(assertNotDemo(async () => true)).rejects.toThrow(DEMO_REFUSAL);
    await expect(assertNotDemo(async () => false)).resolves.toBeUndefined();
  });
});

describe('isUniversalDemoEmail', () => {
  it('matches only the shared visitor, case-insensitively', () => {
    vi.stubEnv('DEMO_USER_EMAIL', '');
    expect(isUniversalDemoEmail('Shared-Visitor@demo.example')).toBe(true);
    expect(isUniversalDemoEmail('owner@realbar.com')).toBe(false);
    expect(isUniversalDemoEmail('x@rail.demo')).toBe(false);
    expect(isUniversalDemoEmail(undefined)).toBe(false);
  });
});

describe('blocksDemoApiWrite', () => {
  it('blocks API writes for the demo user except entry and sign out', () => {
    expect(blocksDemoApiWrite('POST', '/api/billing/checkout')).toBe(true);
    expect(blocksDemoApiWrite('DELETE', '/api/v1/x')).toBe(true);
    expect(blocksDemoApiWrite('POST', '/api/demo')).toBe(false);
    expect(blocksDemoApiWrite('GET', '/api/billing/portal')).toBe(false);
    expect(blocksDemoApiWrite('POST', '/app/inventory')).toBe(false); // server actions: guarded at the client
  });
});
