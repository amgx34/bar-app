import { describe, it, expect, vi } from 'vitest';
import { getAccessToken, loginToast, type CredentialStore } from './auth';
import { NeedsReauthError } from '@/lib/pos/providers/types';
import type { StoredCredentials } from '@/lib/pos/credentials';

const NOW = 1_000_000_000_000;
const HOUR = 3_600_000;
const ok = (accessToken = 'tok-new', expiresIn = 86_400) =>
  new Response(JSON.stringify({ token: { accessToken, expiresIn } }), { status: 200 });

// An in-memory credentials row with the same compare-and-swap rule as the table.
function memStore(initial: StoredCredentials) {
  let row = { ...initial };
  const store: CredentialStore = {
    load: async () => ({ ...row }),
    save: vi.fn(async (_a, _o, creds, expected) => {
      if (expected != null && expected !== row.version) return { ok: false, version: null };
      row = { ...row, secrets: creds.secrets, version: (row.version ?? 0) + 1 };
      return { ok: true, version: row.version };
    }),
  };
  return { store, get row() { return row; }, set row(r) { row = r; } };
}
const creds = (secrets: Record<string, unknown>, version: number | null = 1): StoredCredentials =>
  ({ provider: 'toast', externalId: 'R-1', secrets, version, store: 'table' });
const admin = {} as never;

describe('loginToast', () => {
  it('posts the machine-client login and computes the expiry from expiresIn', async () => {
    const f = vi.fn(async () => ok('abc', 600)) as unknown as typeof fetch;
    const r = await loginToast('cid', 'sec', NOW, f, 'https://toast.test');
    expect(r).toEqual({ accessToken: 'abc', expiresAt: NOW + 600_000 });
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe('https://toast.test/authentication/v1/authentication/login');
    expect(JSON.parse(String(init.body))).toEqual({ clientId: 'cid', clientSecret: 'sec', userAccessType: 'TOAST_MACHINE_CLIENT' });
  });

  it('a 401 or 403 needs a person; a 429 does not and is not retried', async () => {
    for (const status of [401, 403]) {
      const f = (async () => new Response('bad', { status })) as unknown as typeof fetch;
      await expect(loginToast('c', 's', NOW, f, 'https://x')).rejects.toBeInstanceOf(NeedsReauthError);
    }
    const f = vi.fn(async () => new Response('slow down', { status: 429 })) as unknown as typeof fetch;
    const e = await loginToast('c', 's', NOW, f, 'https://x').catch((x: unknown) => x);
    expect(e).not.toBeInstanceOf(NeedsReauthError);
    expect((e as Error).message).toMatch(/throttling/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('never puts the secret in an error', async () => {
    const f = (async () => new Response('{"secret":"sec"}', { status: 500 })) as unknown as typeof fetch;
    const e = (await loginToast('cid', 'sec-VALUE', NOW, f, 'https://x').catch((x: unknown) => x)) as Error;
    expect(e.message).not.toContain('sec-VALUE');
  });

  it('a response with no token is an error', async () => {
    const f = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    await expect(loginToast('c', 's', NOW, f, 'https://x')).rejects.toThrow(/no access token/);
  });
});

describe('getAccessToken', () => {
  const base = { client_id: 'cid', client_secret: 'sec' };

  it('uses the cached token and does not log in again', async () => {
    const m = memStore(creds({ ...base, access_token: 'cached', token_expires_at: NOW + HOUR }));
    const f = vi.fn() as unknown as typeof fetch;
    expect(await getAccessToken({ admin, orgId: 'o', now: NOW, fetchFn: f, store: m.store })).toBe('cached');
    expect(f).not.toHaveBeenCalled();
  });

  it('logs in when the token is close to expiry and saves it under the row version', async () => {
    const m = memStore(creds({ ...base, access_token: 'old', token_expires_at: NOW + 60_000 }));
    const f = vi.fn(async () => ok('fresh')) as unknown as typeof fetch;
    expect(await getAccessToken({ admin, orgId: 'o', now: NOW, fetchFn: f, store: m.store })).toBe('fresh');
    expect(m.store.save).toHaveBeenCalledWith(admin, 'o', expect.objectContaining({ externalId: 'R-1' }), 1);
    expect(m.row.secrets).toMatchObject({ client_id: 'cid', client_secret: 'sec', access_token: 'fresh' });
  });

  it('logs in on first use, when there is no token yet', async () => {
    const m = memStore(creds(base));
    const f = vi.fn(async () => ok('first')) as unknown as typeof fetch;
    expect(await getAccessToken({ admin, orgId: 'o', now: NOW, fetchFn: f, store: m.store })).toBe('first');
  });

  it('a rejected token is replaced, but only if it is still the stored one', async () => {
    const m = memStore(creds({ ...base, access_token: 'moved-on', token_expires_at: NOW + HOUR }));
    const f = vi.fn() as unknown as typeof fetch;
    // Someone else already replaced "rejected-one"
    expect(await getAccessToken({ admin, orgId: 'o', now: NOW, force: true, rejected: 'rejected-one', fetchFn: f, store: m.store })).toBe('moved-on');
    expect(f).not.toHaveBeenCalled();
    const g = vi.fn(async () => ok('replacement')) as unknown as typeof fetch;
    expect(await getAccessToken({ admin, orgId: 'o', now: NOW, force: true, rejected: 'moved-on', fetchFn: g, store: m.store })).toBe('replacement');
  });

  it('loses a race gracefully: uses the winner token, not its own', async () => {
    const m = memStore(creds({ ...base, access_token: 'old', token_expires_at: NOW + 1000 }));
    const f = vi.fn(async () => {
      // Another worker saves between our load and our save.
      m.row = { ...m.row, version: 2, secrets: { ...base, access_token: 'winner', token_expires_at: NOW + HOUR } };
      return ok('loser');
    }) as unknown as typeof fetch;
    expect(await getAccessToken({ admin, orgId: 'o', now: NOW, fetchFn: f, store: m.store })).toBe('winner');
  });

  it('with no stored credentials, or none usable, the answer is reconnect', async () => {
    const none: CredentialStore = { load: async () => null, save: vi.fn() };
    await expect(getAccessToken({ admin, orgId: 'o', now: NOW, store: none })).rejects.toBeInstanceOf(NeedsReauthError);
    const m = memStore(creds({ access_token: 'x', token_expires_at: 1 }));
    await expect(getAccessToken({ admin, orgId: 'o', now: NOW, store: m.store })).rejects.toBeInstanceOf(NeedsReauthError);
  });

  it('works on the degraded store, where there is no version to swap on', async () => {
    const m = memStore(creds(base, null));
    const f = vi.fn(async () => ok('degraded')) as unknown as typeof fetch;
    expect(await getAccessToken({ admin, orgId: 'o', now: NOW, fetchFn: f, store: m.store })).toBe('degraded');
  });
});
