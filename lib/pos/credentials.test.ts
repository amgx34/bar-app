import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'crypto';
import type { createAdminClient } from '@/lib/supabase/admin';
import { createFakeAdmin, type Call, type QueryCall, type Reply } from '@/lib/test/fake-admin';
import { loadCredentials, saveCredentials, isMissingTable } from './credentials';
import { encryptJSON } from '@/lib/direct-deposit/crypto';

beforeAll(() => { process.env.DD_ENCRYPTION_KEY = randomBytes(32).toString('base64'); });

const fake = (respond: (c: QueryCall) => Reply | undefined) => {
  const f = createFakeAdmin((c: Call) => ('table' in c ? respond(c) : undefined));
  return { ...f, admin: f.client as unknown as ReturnType<typeof createAdminClient> };
};
const missing = { error: { message: 'relation "pos_credentials" does not exist' } };
const secrets = { access_token: 'a', refresh_token: 'r' };

describe('credentials, table present', () => {
  it('round-trips ciphertext and never stores plaintext', async () => {
    let stored = '';
    const f = fake((c) => {
      if (c.op === 'upsert') stored = (c.payload as { secrets: string }).secrets;
      if (c.op === 'select') return { data: { provider: 'clover', external_id: 'M1', secrets: stored, version: 4 } };
    });
    await saveCredentials(f.admin, 'org-1', { provider: 'clover', externalId: 'M1', secrets });
    expect(stored).not.toContain('refresh_token');
    expect(await loadCredentials(f.admin, 'org-1', 'clover')).toMatchObject({ externalId: 'M1', secrets, version: 4, store: 'table' });
  });

  it('a compare-and-swap that matches no row reports a conflict', async () => {
    const f = fake((c) => (c.op === 'update' ? { data: [] } : undefined));
    expect(await saveCredentials(f.admin, 'org-1', { provider: 'clover', externalId: 'M1', secrets }, 3))
      .toEqual({ ok: false, version: null });
    const upd = f.calls[0] as QueryCall;
    expect(upd.filters).toEqual(['eq organization_id="org-1"', 'eq version=3']);
    expect(upd.payload).toMatchObject({ version: 4 });
  });

  it('a compare-and-swap that lands bumps the version', async () => {
    const f = fake((c) => (c.op === 'update' ? { data: [{ version: 4 }] } : undefined));
    expect(await saveCredentials(f.admin, 'org-1', { provider: 'clover', externalId: 'M1', secrets }, 3))
      .toEqual({ ok: true, version: 4 });
  });

  it('a different provider on the row is not handed back', async () => {
    const f = fake(() => ({ data: { provider: 'toast', external_id: 'g', secrets: encryptJSON(secrets), version: 1 } }));
    expect(await loadCredentials(f.admin, 'org-1', 'clover')).toBeNull();
  });

  it('a real database error is thrown, not mistaken for a missing table', async () => {
    const f = fake(() => ({ error: { message: 'connection reset' } }));
    await expect(loadCredentials(f.admin, 'org-1', 'clover')).rejects.toThrow('connection reset');
  });
});

describe('credentials, table missing', () => {
  it('detects the missing-table shapes', () => {
    expect(isMissingTable({ code: '42P01' })).toBe(true);
    expect(isMissingTable({ code: 'PGRST205' })).toBe(true);
    expect(isMissingTable({ message: 'x' })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });

  it('loads from pos_config.credentials_enc', async () => {
    const f = fake((c) =>
      c.table === 'pos_credentials' ? missing
        : { data: { pos_config: { merchant_id: 'M1', credentials_enc: encryptJSON(secrets) } } });
    expect(await loadCredentials(f.admin, 'org-1', 'clover'))
      .toMatchObject({ externalId: 'M1', secrets, version: null, store: 'config' });
  });

  it('reads a legacy plaintext Clover token as-is', async () => {
    const f = fake((c) =>
      c.table === 'pos_credentials' ? missing : { data: { pos_config: { merchant_id: 'M1', access_token: 'old' } } });
    expect((await loadCredentials(f.admin, 'org-1', 'clover'))?.secrets).toEqual({ access_token: 'old' });
  });

  it('saves into the LATEST pos_config, keeping other keys and dropping the plaintext token', async () => {
    const f = fake((c) =>
      c.table === 'pos_credentials' ? missing
        : c.op === 'select' ? { data: { pos_config: { merchant_id: 'M1', last_sync_at: 'T', access_token: 'old' } } }
        : undefined);
    const r = await saveCredentials(f.admin, 'org-1', { provider: 'clover', externalId: 'M1', secrets });
    expect(r).toEqual({ ok: true, version: null });
    const w = f.calls.filter((c): c is QueryCall => 'table' in c && c.table === 'organizations' && c.op === 'update')[0];
    const cfg = (w.payload as { pos_config: Record<string, unknown> }).pos_config;
    expect(cfg).toMatchObject({ merchant_id: 'M1', last_sync_at: 'T' });
    expect(cfg).not.toHaveProperty('access_token');
    expect(typeof cfg.credentials_enc).toBe('string');
  });
});
