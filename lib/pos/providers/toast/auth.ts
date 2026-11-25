/**
 * Toast machine-client login and the cached token.
 *
 * There is no refresh: the credentials log in for a token that lasts about a
 * day. The token is cached in the encrypted credentials row so a day's syncs
 * share one login, because Toast throttles logins and Vercel egress IPs are
 * shared across every bar. A login goes in under compare-and-swap on the row
 * version; a loser reloads and uses the winner's token instead of logging in
 * again.
 *
 * UNVERIFIED without Toast API access (spec s.11): the exact response fields,
 * the real throttle, and the scope list. A 429 is reported, never retried in a
 * loop.
 */

import {
  loadCredentials, saveCredentials,
  type Secrets, type StoredCredentials,
} from '@/lib/pos/credentials';
import { NeedsReauthError } from '@/lib/pos/providers/types';
import { toastHost } from '@/lib/toast/client';
import type { ToastLoginResponse } from '@/lib/toast/types';
import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;
type Fetch = typeof fetch;

const RENEW_WITHIN_MS = 5 * 60 * 1000;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // when Toast gives no expiresIn, assume the shortest sane life

export type ToastLogin = { accessToken: string; expiresAt: number };

/**
 * Exchanges client credentials for a token. Errors never include the secret or
 * the response body beyond the status: 401/403 mean the credentials are wrong or
 * lack API access (a person must fix it), 429 means throttled (try later).
 */
export async function loginToast(
  clientId: string, clientSecret: string, now = Date.now(), fetchFn: Fetch = fetch, host = toastHost(),
): Promise<ToastLogin> {
  let res: Response;
  try {
    res = await fetchFn(`${host}/authentication/v1/authentication/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Rail/1.0' },
      body: JSON.stringify({ clientId, clientSecret, userAccessType: 'TOAST_MACHINE_CLIENT' }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new Error(`Toast login unreachable: ${e instanceof Error ? e.message : 'network error'}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new NeedsReauthError('Toast rejected the saved API credentials. Reconnect Toast.');
  }
  if (res.status === 429) throw new Error('Toast is throttling logins right now. It will retry on the next sync.');
  if (!res.ok) throw new Error(`Toast login failed (${res.status})`);
  let body: ToastLoginResponse = {};
  try { body = (await res.json()) as ToastLoginResponse; } catch { /* handled below */ }
  const t = body.token;
  if (!t?.accessToken) throw new Error('Toast login returned no access token');
  const ttl = typeof t.expiresIn === 'number' && t.expiresIn > 0 ? t.expiresIn * 1000 : DEFAULT_TTL_MS;
  return { accessToken: t.accessToken, expiresAt: now + ttl };
}

export type CredentialStore = {
  load: (admin: Admin, orgId: string) => Promise<StoredCredentials | null>;
  save: typeof saveCredentials;
};
const defaultStore: CredentialStore = { load: (a, o) => loadCredentials(a, o, 'toast'), save: saveCredentials };

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const fresh = (s: Secrets, now: number) =>
  str(s.access_token) !== '' && typeof s.token_expires_at === 'number' && s.token_expires_at - now >= RENEW_WITHIN_MS;

/** A usable token: the cached one while it has life left, otherwise one login saved under CAS. */
export async function getAccessToken(opts: {
  admin: Admin; orgId: string; force?: boolean; rejected?: string;
  now?: number; fetchFn?: Fetch; store?: CredentialStore;
}): Promise<string> {
  const { admin, orgId, force, rejected, fetchFn = fetch, store = defaultStore } = opts;
  const now = opts.now ?? Date.now();
  const creds = await store.load(admin, orgId);
  if (!creds) throw new NeedsReauthError('Toast is not connected');
  const s = creds.secrets;
  // Another worker may already have replaced the token the caller saw rejected.
  const stale = force && s.access_token === rejected;
  if (fresh(s, now) && !stale) return s.access_token as string;

  const clientId = str(s.client_id), clientSecret = str(s.client_secret);
  if (!clientId || !clientSecret) throw new NeedsReauthError('Toast credentials are missing. Reconnect Toast.');

  const login = await loginToast(clientId, clientSecret, now, fetchFn);
  const saved = await store.save(
    admin, orgId,
    { provider: 'toast', externalId: creds.externalId, secrets: { ...s, access_token: login.accessToken, token_expires_at: login.expiresAt } },
    creds.version);
  if (!saved.ok) {
    const winner = await store.load(admin, orgId);
    if (winner && fresh(winner.secrets, now)) return winner.secrets.access_token as string;
    // The row moved on without a fresh token (reconnected or disconnected): do not use ours.
    throw new Error('Toast connection changed while logging in. Try again.');
  }
  return login.accessToken;
}
