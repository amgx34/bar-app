/**
 * Clover OAuth v2: hosts, signed state, code exchange and expiring-token
 * refresh.
 *
 * Refresh tokens are SINGLE USE. Two workers refreshing at once would strand
 * the connection: the loser spends a token the winner already consumed. So the
 * new pair is written under compare-and-swap on the credentials row's version
 * BEFORE the response is used, and a loser reloads and uses the winner's pair.
 *
 * UNVERIFIED without a Clover app (spec section 11): the token host, JSON versus
 * form encoding, and the units of the *_expiration fields (read defensively
 * below: a value past 1e12 is milliseconds, otherwise seconds).
 */

import { createHmac, timingSafeEqual } from 'crypto';
import {
  loadCredentials, saveCredentials,
  type Secrets, type StoredCredentials,
} from '@/lib/pos/credentials';
import { NeedsReauthError } from '@/lib/pos/providers/types';
import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

export type CloverRegion = 'na' | 'eu' | 'la' | 'sandbox';
export const CLOVER_REGIONS: CloverRegion[] = ['na', 'eu', 'la'];

const HOSTS: Record<CloverRegion, { web: string; api: string }> = {
  na:      { web: 'https://www.clover.com',            api: 'https://api.clover.com' },
  eu:      { web: 'https://www.eu.clover.com',         api: 'https://api.eu.clover.com' },
  la:      { web: 'https://www.la.clover.com',         api: 'https://api.la.clover.com' },
  sandbox: { web: 'https://sandbox.dev.clover.com',    api: 'https://apisandbox.dev.clover.com' },
};

export function cloverHosts(region: CloverRegion) {
  return HOSTS[region];
}

/** CLOVER_SANDBOX forces the sandbox hosts; otherwise the region the bar chose. */
export function effectiveRegion(chosen: unknown, env: Record<string, string | undefined> = process.env): CloverRegion {
  if (env.CLOVER_SANDBOX === 'true') return 'sandbox';
  if (chosen === 'na' || chosen === 'eu' || chosen === 'la') return chosen;
  const d = env.CLOVER_API_REGION;
  return d === 'eu' || d === 'la' ? d : 'na';
}

// ── Signed state ────────────────────────────────────────────────────────────
//
// Everything the callback needs rides in the state so nothing is written to the
// org until Clover has answered: org, the choices made at setup, a nonce that
// is also set in an httpOnly cookie, and an expiry.

export type OAuthState = {
  /** org id */ o: string;
  /** region */ r: CloverRegion;
  /** cutoff hour */ c: number;
  /** IANA zone chosen at setup, used only if Clover does not report one */ tz?: string;
  /** nonce */ n: string;
  /** expiry, epoch ms */ e: number;
};

const mac = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url');

export function signState(state: OAuthState, secret: string): string {
  const body = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `${body}.${mac(body, secret)}`;
}

export function verifyState(token: string | null | undefined, secret: string, now = Date.now()): OAuthState | null {
  if (!token || !secret) return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const body = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const want = Buffer.from(mac(body, secret));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthState;
    if (typeof s.o !== 'string' || typeof s.n !== 'string' || typeof s.e !== 'number' || s.e < now) return null;
    return s;
  } catch {
    return null;
  }
}

// ── Token endpoints ─────────────────────────────────────────────────────────

type TokenJson = {
  access_token?: string;
  access_token_expiration?: number;
  refresh_token?: string;
  refresh_token_expiration?: number;
  merchant_id?: string;
};

const toMs = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? (n > 1e12 ? n : n * 1000) : undefined;

export function secretsFromTokenResponse(j: TokenJson): Secrets | null {
  if (!j.access_token) return null;
  return {
    access_token: j.access_token,
    access_token_expiration: toMs(j.access_token_expiration),
    refresh_token: j.refresh_token,
    refresh_token_expiration: toMs(j.refresh_token_expiration),
  };
}

type Fetch = typeof fetch;

async function postJson(url: string, body: unknown, fetchFn: Fetch): Promise<{ status: number; json: TokenJson }> {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let json: TokenJson = {};
  try { json = (await res.json()) as TokenJson; } catch { /* non-JSON error body */ }
  return { status: res.status, json };
}

export async function exchangeCode(
  region: CloverRegion, code: string, env = process.env, fetchFn: Fetch = fetch,
): Promise<Secrets> {
  const clientId = env.CLOVER_CLIENT_ID, clientSecret = env.CLOVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('CLOVER_CLIENT_ID and CLOVER_CLIENT_SECRET must be set');
  const { status, json } = await postJson(
    `${cloverHosts(region).api}/oauth/v2/token`,
    { client_id: clientId, client_secret: clientSecret, code }, fetchFn);
  const secrets = status >= 200 && status < 300 ? secretsFromTokenResponse(json) : null;
  if (!secrets) throw new Error(`Clover token exchange failed (${status})`);
  return secrets;
}

const REFRESH_WITHIN_MS = 5 * 60 * 1000;

export function needsRefresh(secrets: Secrets, now: number): boolean {
  const exp = secrets.access_token_expiration;
  // No recorded expiry (a connection made before expiring tokens): use it until it 401s.
  return typeof exp === 'number' && exp - now < REFRESH_WITHIN_MS;
}

export type CredentialStore = {
  load: (admin: Admin, orgId: string) => Promise<StoredCredentials | null>;
  save: typeof saveCredentials;
};
const defaultStore: CredentialStore = { load: (a, o) => loadCredentials(a, o, 'clover'), save: saveCredentials };

/**
 * A usable access token, refreshing first when it is close to expiry or when
 * `force` says the API just rejected it.
 *
 * Throws NeedsReauthError when there is nothing left to refresh with, which the
 * sync records as `needs_reauth` so the panel can say "Reconnect Clover".
 */
export async function getAccessToken(opts: {
  admin: Admin; orgId: string; region: CloverRegion; force?: boolean; rejected?: string;
  now?: number; env?: NodeJS.ProcessEnv; fetchFn?: Fetch; store?: CredentialStore;
}): Promise<string> {
  const { admin, orgId, region, force, rejected, env = process.env, fetchFn = fetch, store = defaultStore } = opts;
  const now = opts.now ?? Date.now();
  const creds = await store.load(admin, orgId);
  if (!creds) throw new NeedsReauthError('Clover is not connected');
  const s = creds.secrets;
  const token = typeof s.access_token === 'string' ? s.access_token : '';
  // Another worker may already have replaced the token the caller saw rejected.
  const stale = force && token === rejected;
  if (token && !needsRefresh(s, now) && !stale) return token;

  const refreshToken = typeof s.refresh_token === 'string' ? s.refresh_token : '';
  const clientId = env.CLOVER_CLIENT_ID;
  if (!refreshToken || !clientId) throw new NeedsReauthError('Clover login has expired. Reconnect Clover.');
  const refreshExp = s.refresh_token_expiration;
  if (typeof refreshExp === 'number' && refreshExp < now) throw new NeedsReauthError('Clover login has expired. Reconnect Clover.');

  const { status, json } = await postJson(
    `${cloverHosts(region).api}/oauth/v2/refresh`, { client_id: clientId, refresh_token: refreshToken }, fetchFn);
  const next = status >= 200 && status < 300 ? secretsFromTokenResponse(json) : null;

  if (!next) {
    // The refresh token is single use: if it failed, a concurrent worker may have spent it.
    const again = await store.load(admin, orgId);
    if (again && again.version !== creds.version && typeof again.secrets.access_token === 'string'
        && !needsRefresh(again.secrets, now)) return again.secrets.access_token;
    if (status >= 500 || status === 0) throw new Error(`Clover refresh unavailable (${status})`);
    throw new NeedsReauthError('Clover rejected the saved login. Reconnect Clover.');
  }

  const saved = await store.save(
    admin, orgId, { provider: 'clover', externalId: creds.externalId, secrets: next }, creds.version);
  if (!saved.ok) {
    // Lost the compare-and-swap: use the winner's pair, not ours.
    const winner = await store.load(admin, orgId);
    if (winner && typeof winner.secrets.access_token === 'string') return winner.secrets.access_token;
    throw new NeedsReauthError('Clover login changed while refreshing. Try again.');
  }
  return next.access_token as string;
}
