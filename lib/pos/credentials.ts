/**
 * Encrypted credentials for pull-based POS sources (Clover, Toast).
 *
 * Primary store is the service-role-only `pos_credentials` table, which gives
 * compare-and-swap through `version`. While that migration is not applied the
 * same ciphertext lives in `pos_config.credentials_enc`. That path is DEGRADED:
 * it has no compare-and-swap, so two concurrent Clover refreshes can strand a
 * single-use refresh token. It exists so the app works before the migration is
 * applied, not as an equal.
 */

import { decryptJSON, encryptJSON } from '@/lib/direct-deposit/crypto';
import type { createAdminClient } from '@/lib/supabase/admin';
import { applyCredentialsEnc, type PosConfig } from '@/lib/pos/pos-config';

type Admin = ReturnType<typeof createAdminClient>;

export type PosProvider = 'clover' | 'toast';
export type Secrets = Record<string, unknown>;

export type StoredCredentials = {
  provider: PosProvider;
  externalId: string;
  secrets: Secrets;
  /** Pass back to saveCredentials for compare-and-swap. Null on the degraded path. */
  version: number | null;
  store: 'table' | 'config';
};

/** Postgres 42P01, PostgREST PGRST205 or its message: the table is not there. */
export function isMissingTable(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === '42P01' || e.code === 'PGRST205'
    || /does not exist|schema cache/i.test(e.message ?? '');
}

async function readConfig(admin: Admin, orgId: string): Promise<PosConfig> {
  const { data } = await admin.from('organizations').select('pos_config').eq('id', orgId).single();
  return (data?.pos_config ?? {}) as PosConfig;
}

export async function loadCredentials(
  admin: Admin,
  orgId: string,
  provider: PosProvider,
): Promise<StoredCredentials | null> {
  const { data, error } = await admin
    .from('pos_credentials')
    .select('provider, external_id, secrets, version')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!error) {
    if (!data || data.provider !== provider) return null;
    return {
      provider,
      externalId: String(data.external_id),
      secrets: decryptJSON<Secrets>(data.secrets),
      version: Number(data.version),
      store: 'table',
    };
  }
  if (!isMissingTable(error)) throw new Error(`pos_credentials: ${error.message}`);

  // Degraded path.
  const cfg = await readConfig(admin, orgId);
  const externalId = String(cfg.merchant_id ?? cfg.restaurant_guid ?? '');
  const secrets: Secrets | null =
    typeof cfg.credentials_enc === 'string' ? decryptJSON<Secrets>(cfg.credentials_enc)
    // Clover connections made before this existed kept a plaintext token here.
    : typeof cfg.access_token === 'string' ? { access_token: cfg.access_token }
    : null;
  if (!secrets) return null;
  return { provider, externalId, secrets, version: null, store: 'config' };
}

/**
 * Writes the secrets. `expectedVersion` is the version loadCredentials returned;
 * a mismatch means another worker wrote first and `{ ok: false }` comes back, so
 * the caller reloads and uses theirs rather than overwriting. Omit it only for a
 * first save at connect time.
 */
export async function saveCredentials(
  admin: Admin,
  orgId: string,
  creds: { provider: PosProvider; externalId: string; secrets: Secrets },
  expectedVersion?: number | null,
): Promise<{ ok: boolean; version: number | null }> {
  const enc = encryptJSON(creds.secrets);
  const now = new Date().toISOString();

  if (expectedVersion != null) {
    const { data, error } = await admin
      .from('pos_credentials')
      .update({ secrets: enc, version: expectedVersion + 1, updated_at: now })
      .eq('organization_id', orgId)
      .eq('version', expectedVersion)
      .select('version');
    if (!error) {
      return data?.length ? { ok: true, version: expectedVersion + 1 } : { ok: false, version: null };
    }
    if (!isMissingTable(error)) throw new Error(`pos_credentials: ${error.message}`);
  } else {
    const { error } = await admin
      .from('pos_credentials')
      .upsert(
        { organization_id: orgId, provider: creds.provider, external_id: creds.externalId, secrets: enc, version: 1, updated_at: now },
        { onConflict: 'organization_id' },
      );
    if (!error) return { ok: true, version: 1 };
    if (!isMissingTable(error)) throw new Error(`pos_credentials: ${error.message}`);
  }

  // Degraded path: read the latest config now and build from it, never from a copy read earlier.
  console.warn(`[pos] pos_credentials is missing; storing org ${orgId} secrets in pos_config without compare-and-swap`);
  const next = applyCredentialsEnc(await readConfig(admin, orgId), enc);
  const { error } = await admin.from('organizations').update({ pos_config: next }).eq('id', orgId);
  if (error) throw new Error(`pos_config: ${error.message}`);
  return { ok: true, version: null };
}

/** Disconnect. Removes the row, and the degraded copy if there is one. */
export async function deleteCredentials(admin: Admin, orgId: string): Promise<void> {
  const { error } = await admin.from('pos_credentials').delete().eq('organization_id', orgId);
  if (error && !isMissingTable(error)) throw new Error(`pos_credentials: ${error.message}`);
  const cfg = await readConfig(admin, orgId);
  if ('credentials_enc' in cfg) {
    const { credentials_enc: _gone, ...rest } = cfg;
    void _gone;
    await admin.from('organizations').update({ pos_config: rest }).eq('id', orgId);
  }
}
