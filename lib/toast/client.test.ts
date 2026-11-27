import { describe, it, expect, vi } from 'vitest';
import { createToastClient, ToastHttpError, toastHost, fromToastDate, toToastDate, flattenMenuItems } from './client';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function setup(responses: Array<Response | Error>, getToken = vi.fn(async () => 'tok1')) {
  const seen: { url: string; headers: Headers }[] = [];
  const fetchFn = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(u), headers: new Headers(init?.headers) });
    const r = responses.shift();
    if (!r) throw new Error('unexpected extra request');
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  const sleeps: number[] = [];
  const client = createToastClient({
    host: 'https://toast.test', restaurantGuid: 'R-1', getToken, fetchFn,
    sleep: async (ms) => { sleeps.push(ms); }, pageSize: 2,
  });
  return { client, seen, sleeps, getToken, fetchFn };
}
const o = (guid: string) => ({ guid });

describe('createToastClient', () => {
  it('sends the restaurant header and bearer token, and pages until an empty page', async () => {
    const { client, seen } = setup([json([o('a'), o('b')]), json([o('c')]), json([])]);
    const all = await client.ordersForDate('2026-11-21');
    expect(all.map((x) => x.guid)).toEqual(['a', 'b', 'c']); // a short page is not the end
    expect(seen[0].headers.get('authorization')).toBe('Bearer tok1');
    expect(seen[0].headers.get('toast-restaurant-external-id')).toBe('R-1');
    const u = new URL(seen[1].url);
    expect(u.pathname).toBe('/orders/v2/ordersBulk');
    expect(u.searchParams.get('businessDate')).toBe('20261121');
    expect(u.searchParams.get('page')).toBe('2');
    expect(u.searchParams.get('pageSize')).toBe('2');
  });

  it('stops with an error when the server ignores paging and repeats a page', async () => {
    const { client } = setup([json([o('a'), o('b')]), json([o('a'), o('b')])]);
    await expect(client.ordersForDate('2026-11-21')).rejects.toThrow(/repeated a page/);
  });

  it('asks for modified orders with a window', async () => {
    const { client, seen } = setup([json([])]);
    await client.ordersModified(new Date('2026-11-21T09:00:00Z'), new Date('2026-11-24T09:00:00Z'));
    const u = new URL(seen[0].url);
    expect(u.searchParams.get('startDate')).toBe('2026-11-21T09:00:00.000+0000');
    expect(u.searchParams.has('businessDate')).toBe(false);
  });

  it('backs off on 429 honouring Retry-After, then on 5xx exponentially', async () => {
    const { client, sleeps } = setup([json({}, 429, { 'retry-after': '3' }), json({}, 503), json([])]);
    expect(await client.employees()).toEqual([]);
    expect(sleeps.filter((s) => s >= 1000)).toEqual([3000, 2000]);
  });

  it('gives up after the retry budget with the status in the error', async () => {
    const { client } = setup(Array.from({ length: 6 }, () => json({}, 429)));
    await expect(client.employees()).rejects.toMatchObject({ status: 429 });
  });

  it('logs in again once when the token is rejected, and retries with the new one', async () => {
    const getToken = vi.fn(async (force?: { rejected: string }) => (force ? 'tok2' : 'tok1'));
    const { client, seen } = setup([json({}, 401), json([o('e')])], getToken);
    expect((await client.employees()).length).toBe(1);
    expect(getToken).toHaveBeenNthCalledWith(2, { rejected: 'tok1' });
    expect(seen.map((s) => s.headers.get('authorization'))).toEqual(['Bearer tok1', 'Bearer tok2']);
  });

  it('a second 401 is an error, not a loop', async () => {
    const { client, getToken } = setup([json({}, 401), json({}, 401)]);
    await expect(client.employees()).rejects.toBeInstanceOf(ToastHttpError);
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 403 and does not leak the token', async () => {
    const { client, fetchFn } = setup([new Response('missing scope', { status: 403 })]);
    const e = (await client.timeEntries('2026-11-21').catch((x: unknown) => x)) as Error;
    expect(e).toMatchObject({ status: 403 });
    expect(e.message).not.toContain('tok1');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries a network failure or timeout', async () => {
    const { client } = setup([new Error('socket hang up'), json([])]);
    expect(await client.employees()).toEqual([]);
  });

  it('treats a non-array body on a list endpoint as an error, never as "none"', async () => {
    const { client } = setup([json({ message: 'oops' })]);
    await expect(client.employees()).rejects.toThrow(/unexpected response/);
  });

  it('refuses to silently truncate an enormous list', async () => {
    const fetchFn = vi.fn(async () => json([o(String(Math.random())), o(String(Math.random()))])) as unknown as typeof fetch;
    const c = createToastClient({ host: 'https://x', restaurantGuid: 'R', getToken: async () => 't', fetchFn, sleep: async () => {}, pageSize: 2, maxPages: 3 });
    await expect(c.ordersForDate('2026-11-21')).rejects.toThrow(/more than 3 pages/);
  });
});

describe('helpers', () => {
  it('takes the host from the environment and insists on https', () => {
    expect(toastHost({})).toBe('https://ws-api.toasttab.com');
    expect(toastHost({ TOAST_API_HOST: 'ws-sandbox-api.toasttab.com' })).toBe('https://ws-sandbox-api.toasttab.com');
    expect(() => toastHost({ TOAST_API_HOST: 'http://insecure.example' })).toThrow(/https/);
  });
  it('converts business dates both ways', () => {
    expect(toToastDate('2026-11-21')).toBe('20261121');
    expect(fromToastDate(20261121)).toBe('2026-11-21');
    expect(fromToastDate(undefined)).toBeNull();
    expect(fromToastDate('2026-11-21')).toBeNull();
  });
  it('flattens nested menu groups, carrying the nearest group name', () => {
    const items = flattenMenuItems({ menus: [{ guid: 'M', menuGroups: [{ guid: 'g', name: 'A', menuGroups: [{ guid: 'h', name: 'B', menuItems: [{ guid: 'i', name: 'X' }] }] }] }] });
    expect(items).toEqual([{ guid: 'i', name: 'X', group: 'B' }]);
  });
});
