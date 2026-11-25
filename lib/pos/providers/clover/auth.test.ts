import { describe, it, expect, vi } from 'vitest';
import {
  signState, verifyState, effectiveRegion, cloverHosts, secretsFromTokenResponse,
  getAccessToken, type CredentialStore, type OAuthState,
} from './auth';
import { NeedsReauthError } from '@/lib/pos/providers/types';
import type { StoredCredentials } from '@/lib/pos/credentials';

const SECRET = 'test-state-secret';
const st: OAuthState = { o: 'org-1', r: 'na', c: 4, n: 'nonce', e: 2_000_000 };

describe('signed OAuth state', () => {
  it('round trips', () => {
    expect(verifyState(signState(st, SECRET), SECRET, 1_000_000)).toEqual(st);
  });
  it('rejects tampering, a wrong secret, an expiry and junk', () => {
    const t = signState(st, SECRET);
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...st, o: 'org-2' })).toString('base64url');
    expect(verifyState(`${forged}.${sig}`, SECRET, 1)).toBeNull();
    expect(verifyState(t, 'other', 1)).toBeNull();
    expect(verifyState(t, SECRET, 3_000_000)).toBeNull();
    expect(verifyState(`${body}.x`, SECRET, 1)).toBeNull();
    expect(verifyState('nope', SECRET, 1)).toBeNull();
    expect(verifyState(null, SECRET, 1)).toBeNull();
  });
});

describe('hosts', () => {
  it('sandbox env forces sandbox, else the chosen region, else na', () => {
    expect(effectiveRegion('eu', { CLOVER_SANDBOX: 'true' })).toBe('sandbox');
    expect(effectiveRegion('eu', {})).toBe('eu');
    expect(effectiveRegion('bogus', {})).toBe('na');
    expect(effectiveRegion(undefined, { CLOVER_API_REGION: 'la' })).toBe('la');
    expect(cloverHosts('sandbox').api).toBe('https://apisandbox.dev.clover.com');
  });
});

describe('token response', () => {
  it('normalises second and millisecond expirations to ms', () => {
    expect(secretsFromTokenResponse({ access_token: 'a', access_token_expiration: 1_800_000_000 })).toMatchObject({ access_token_expiration: 1_800_000_000_000 });
    expect(secretsFromTokenResponse({ access_token: 'a', access_token_expiration: 1_800_000_000_000 })).toMatchObject({ access_token_expiration: 1_800_000_000_000 });
    expect(secretsFromTokenResponse({})).toBeNull();
  });
});

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
const NOW = 1_000_000_000_000;
const creds = (secrets: Record<string, unknown>, version = 1): StoredCredentials =>
  ({ provider: 'clover', externalId: 'M1', secrets, version, store: 'table' });
const env = { CLOVER_CLIENT_ID: 'cid' } as unknown as NodeJS.ProcessEnv;
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const args = (m: ReturnType<typeof memStore>, f: typeof fetch, extra = {}) =>
  ({ admin: {} as never, orgId: 'org-1', region: 'na' as const, now: NOW, env, fetchFn: f, store: m.store, ...extra });

describe('getAccessToken', () => {
  it('uses a token that is not near expiry without any network call', async () => {
    const m = memStore(creds({ access_token: 'live', access_token_expiration: NOW + 3_600_000, refresh_token: 'r1' }));
    const f = reply(200, {});
    expect(await getAccessToken(args(m, f))).toBe('live');
    expect(f).not.toHaveBeenCalled();
  });

  it('refreshes inside the 5 minute window and persists the new pair under the old version', async () => {
    const m = memStore(creds({ access_token: 'old', access_token_expiration: NOW + 60_000, refresh_token: 'r1' }, 7));
    const f = reply(200, { access_token: 'new', access_token_expiration: (NOW + 3_600_000) / 1000, refresh_token: 'r2', refresh_token_expiration: (NOW + 9e9) / 1000 });
    expect(await getAccessToken(args(m, f))).toBe('new');
    expect(m.store.save).toHaveBeenCalledWith(expect.anything(), 'org-1', expect.objectContaining({ secrets: expect.objectContaining({ refresh_token: 'r2' }) }), 7);
    expect(m.row.version).toBe(8);
    expect(JSON.parse((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toEqual({ client_id: 'cid', refresh_token: 'r1' });
  });

  it('an expired token mid-sync: a forced refresh replaces the token the API rejected', async () => {
    const m = memStore(creds({ access_token: 'stale', access_token_expiration: NOW + 3_600_000, refresh_token: 'r1' }));
    const f = reply(200, { access_token: 'fresh', refresh_token: 'r2' });
    expect(await getAccessToken(args(m, f, { force: true, rejected: 'stale' }))).toBe('fresh');
  });

  it('a forced refresh for a token someone else already replaced does not spend the refresh token', async () => {
    const m = memStore(creds({ access_token: 'theirs', access_token_expiration: NOW + 3_600_000, refresh_token: 'r2' }, 2));
    const f = reply(200, {});
    expect(await getAccessToken(args(m, f, { force: true, rejected: 'mine' }))).toBe('theirs');
    expect(f).not.toHaveBeenCalled();
  });

  it('losing the compare-and-swap returns the winner pair, not ours', async () => {
    const m = memStore(creds({ access_token: 'old', access_token_expiration: NOW + 1000, refresh_token: 'r1' }, 1));
    const f = vi.fn(async () => {
      // The winner lands between our load and our save.
      m.row = { ...m.row, secrets: { access_token: 'winner', access_token_expiration: NOW + 3_600_000, refresh_token: 'rw' }, version: 2 };
      return new Response(JSON.stringify({ access_token: 'loser', refresh_token: 'rl' }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await getAccessToken(args(m, f))).toBe('winner');
    expect(m.row.secrets.refresh_token).toBe('rw');
  });

  it('a failed refresh that another worker already satisfied uses their token', async () => {
    const m = memStore(creds({ access_token: 'old', access_token_expiration: NOW + 1000, refresh_token: 'r1' }, 1));
    const f = vi.fn(async () => {
      m.row = { ...m.row, secrets: { access_token: 'theirs', access_token_expiration: NOW + 3_600_000, refresh_token: 'r2' }, version: 2 };
      return new Response('{}', { status: 400 });
    }) as unknown as typeof fetch;
    expect(await getAccessToken(args(m, f))).toBe('theirs');
  });

  it('asks for a reconnect when the refresh is refused, missing or itself expired', async () => {
    const expiring = { access_token: 'old', access_token_expiration: NOW + 1000 };
    await expect(getAccessToken(args(memStore(creds({ ...expiring, refresh_token: 'r1' })), reply(400, {})))).rejects.toBeInstanceOf(NeedsReauthError);
    await expect(getAccessToken(args(memStore(creds(expiring)), reply(200, {})))).rejects.toBeInstanceOf(NeedsReauthError);
    await expect(getAccessToken(args(memStore(creds({ ...expiring, refresh_token: 'r1', refresh_token_expiration: NOW - 1 })), reply(200, {})))).rejects.toBeInstanceOf(NeedsReauthError);
  });

  it('a Clover outage is not a reconnect', async () => {
    const m = memStore(creds({ access_token: 'old', access_token_expiration: NOW + 1000, refresh_token: 'r1' }));
    const p = getAccessToken(args(m, reply(503, {})));
    await expect(p).rejects.not.toBeInstanceOf(NeedsReauthError);
  });
});
