import { describe, it, expect, vi } from 'vitest';
import { createCloverClient, CloverHttpError } from './client';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function setup(responses: Array<Response | Error>, getToken = vi.fn(async () => 'tok1')) {
  const seen: { url: string; auth: string | null }[] = [];
  const fetchFn = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(u), auth: new Headers(init?.headers).get('authorization') });
    const r = responses.shift();
    if (!r) throw new Error('unexpected extra request');
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  const sleeps: number[] = [];
  const client = createCloverClient({
    apiHost: 'https://api.clover.com', merchantId: 'M1', getToken, fetchFn,
    sleep: async (ms) => { sleeps.push(ms); }, pageSize: 2,
  });
  return { client, seen, sleeps, getToken, fetchFn };
}

describe('createCloverClient', () => {
  it('pages until an empty page and keeps offsets in step with what arrived', async () => {
    const { client, seen } = setup([
      json({ elements: [{ id: 1 }, { id: 2 }] }),
      json({ elements: [{ id: 3 }] }), // short page: not the end
      json({ elements: [] }),
    ]);
    const all = await client.list<{ id: number }>('/orders', { filter: ['createdTime>=1', 'createdTime<2'] });
    expect(all.map((x) => x.id)).toEqual([1, 2, 3]);
    const u = new URL(seen[1].url);
    expect(u.searchParams.get('offset')).toBe('2');
    expect(u.searchParams.getAll('filter')).toEqual(['createdTime>=1', 'createdTime<2']);
    expect(u.pathname).toBe('/v3/merchants/M1/orders');
    expect(seen[0].auth).toBe('Bearer tok1');
  });

  it('backs off on 429 honouring Retry-After, then on 5xx exponentially', async () => {
    const { client, sleeps } = setup([
      json({}, 429, { 'retry-after': '3' }), json({}, 503), json({ ok: true }),
    ]);
    expect(await client.get('/x')).toEqual({ ok: true });
    expect(sleeps.filter((s) => s >= 1000)).toEqual([3000, 2000]);
  });

  it('gives up after the retry budget with the status in the error', async () => {
    const { client } = setup(Array.from({ length: 6 }, () => json({}, 429)));
    await expect(client.get('/x')).rejects.toMatchObject({ status: 429 });
  });

  it('refreshes once when the token is rejected mid-sync, and retries with the new one', async () => {
    const getToken = vi.fn(async (force?: { rejected: string }) => (force ? 'tok2' : 'tok1'));
    const { client, seen } = setup([json({}, 401), json({ elements: [{ id: 1 }] }), json({ elements: [] })], getToken);
    expect((await client.list('/orders')).length).toBe(1);
    expect(getToken).toHaveBeenNthCalledWith(2, { rejected: 'tok1' });
    expect(seen.map((s) => s.auth)).toEqual(['Bearer tok1', 'Bearer tok2', 'Bearer tok2']);
  });

  it('a second 401 after refreshing is an error, not a loop', async () => {
    const { client, getToken } = setup([json({}, 401), json({}, 401)]);
    await expect(client.get('/x')).rejects.toBeInstanceOf(CloverHttpError);
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 403 and does not leak the token', async () => {
    const { client, fetchFn } = setup([new Response('no permission', { status: 403 })]);
    const e = (await client.get('/employees').catch((x: unknown) => x)) as Error;
    expect(e).toMatchObject({ status: 403 });
    expect(e.message).not.toContain('tok1');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries a network failure or timeout', async () => {
    const { client } = setup([new Error('socket hang up'), json({ ok: 1 })]);
    expect(await client.get('/x')).toEqual({ ok: 1 });
  });

  it('refuses to silently truncate an enormous list', async () => {
    const fetchFn = vi.fn(async () => json({ elements: [{ id: 1 }, { id: 2 }] })) as unknown as typeof fetch;
    const c = createCloverClient({ apiHost: 'https://x', merchantId: 'M', getToken: async () => 't', fetchFn, sleep: async () => {}, pageSize: 2, maxElements: 5 });
    await expect(c.list('/orders')).rejects.toThrow(/more than 5/);
  });
});
