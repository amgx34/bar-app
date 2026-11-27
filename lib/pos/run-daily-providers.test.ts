import { describe, it, expect, vi } from 'vitest';
import { runDailyProviderSync } from './run-daily-providers';

const orgs = (...ids: string[]) => ids.map((id) => ({ id }));
const ok = { ran: true as const, ok: true, errors: [], summary: null, needsReauth: false };

describe('runDailyProviderSync', () => {
  it('one org throwing does not stop the others', async () => {
    const sync = vi.fn(async (id: string) => {
      if (id === 'b') throw new Error('boom');
      return ok;
    });
    const r = await runDailyProviderSync({ listOrgs: async () => orgs('a', 'b', 'c'), sync });
    expect(sync.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
    expect(r).toMatchObject({ scanned: 3, synced: 2, failed: 1, skipped: 0 });
    expect(r.errors[0]).toMatch(/b.*boom/);
  });

  it('counts a sync that reports errors or needs reauth as failed, and a held lease as skipped', async () => {
    const results = [
      ok,
      { ...ok, ok: false, errors: ['api: x'] },
      { ...ok, ok: false, needsReauth: true },
      { ran: false as const, reason: 'already-running' as const },
    ];
    let i = 0;
    const r = await runDailyProviderSync({ listOrgs: async () => orgs('a', 'b', 'c', 'd'), sync: async () => results[i++] });
    expect(r).toMatchObject({ synced: 1, failed: 2, skipped: 1 });
  });

  it('stops when the time budget is spent and says how many it left', async () => {
    let t = 0;
    const sync = vi.fn(async () => { t += 30_000; return ok; });
    const r = await runDailyProviderSync({
      listOrgs: async () => orgs('a', 'b', 'c'), sync, now: () => t, budgetMs: 50_000,
    });
    expect(sync).toHaveBeenCalledTimes(2);
    expect(r.deferred).toBe(1);
  });

  it('bounds one org that hangs', async () => {
    const r = await runDailyProviderSync({
      listOrgs: async () => orgs('a', 'b'),
      sync: (id) => (id === 'a' ? new Promise(() => {}) : Promise.resolve(ok)),
      perOrgMs: 20,
    });
    expect(r).toMatchObject({ synced: 1, failed: 1 });
    expect(r.errors[0]).toMatch(/timed out/);
  });

  it('a failed listing is reported, not thrown', async () => {
    const r = await runDailyProviderSync({ listOrgs: async () => { throw new Error('db down'); }, sync: async () => ok });
    expect(r.errors[0]).toMatch(/db down/);
  });
});
