/**
 * One pull for one org: lease, fetch through the provider adapter, apply through
 * the shared applier, record the outcome.
 *
 * pos_config is one JSON blob. The config read at the top of the run is used
 * only to drive the adapter; the outcome is built from a fresh read taken after
 * the work, so a write that landed in between (a reconnect, a settings change)
 * is not put back the way it was. See lib/pos/pos-config.ts.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { applyNormalized, toSyncSummary } from '@/lib/pos/ingest';
import { isMissingTable } from '@/lib/pos/credentials';
import { addDays } from '@/lib/pos/business-date';
import { applyProviderSettings, applySyncOutcome, type PosConfig } from '@/lib/pos/pos-config';
import { adapterFor } from '@/lib/pos/providers/registry';
import { NeedsReauthError, type PosAdapter } from '@/lib/pos/providers/types';
import type { SyncSummary } from '@/lib/pos/sync-health';

type Admin = ReturnType<typeof createAdminClient>;

const LEASE_SECONDS = 90;
export const DEFAULT_LOOKBACK_DAYS = 3;

export type SyncRunOptions = {
  /** Business dates to cover, ending today. Default 3, which also repairs a missed night. */
  days?: number;
  /** Explicit range for a history import. Sets backfill, which leaves the live status alone. */
  from?: string;
  to?: string;
  includeItems?: boolean;
  admin?: Admin;
  now?: Date;
  adapter?: PosAdapter;
};

export type SyncRunResult =
  | { ran: false; reason: 'not-pull-provider' | 'already-running' }
  | { ran: true; ok: boolean; errors: string[]; summary: SyncSummary | null; needsReauth: boolean };

async function takeLease(admin: Admin, orgId: string, now: Date): Promise<'held' | 'free' | 'no-table'> {
  const { data, error } = await admin
    .from('pos_credentials')
    .update({ sync_lease_until: new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString() })
    .eq('organization_id', orgId)
    .or(`sync_lease_until.is.null,sync_lease_until.lt.${now.toISOString()}`)
    .select('organization_id');
  if (error) {
    // shortcut: without the table there is no lease, so two overlapping runs are
    // possible. Both are idempotent (Z upsert, replace-by-night, delta RPC); upgrade by applying the migration.
    if (isMissingTable(error)) return 'no-table';
    console.warn(`[pos] lease for org ${orgId} failed, running unleased:`, error.message);
    return 'no-table';
  }
  return data?.length ? 'free' : 'held';
}

async function releaseLease(admin: Admin, orgId: string) {
  await admin.from('pos_credentials').update({ sync_lease_until: null }).eq('organization_id', orgId);
}

async function writeOutcome(admin: Admin, orgId: string, errors: string[], summary: SyncSummary | null, needsReauth: boolean, now: Date) {
  // Latest config, read now.
  const { data } = await admin.from('organizations').select('pos_config').eq('id', orgId).single();
  const latest = (data?.pos_config ?? {}) as PosConfig;
  const next = applyProviderSettings(applySyncOutcome(latest, errors, summary, now.toISOString()), { needs_reauth: needsReauth });
  const { error } = await admin.from('organizations').update({ pos_config: next }).eq('id', orgId);
  if (error) console.warn('[pos] could not record sync outcome:', error.message);
}

export async function runProviderSync(orgId: string, opts: SyncRunOptions = {}): Promise<SyncRunResult> {
  const admin = opts.admin ?? createAdminClient();
  const now = opts.now ?? new Date();

  const { data: org } = await admin
    .from('organizations')
    .select('id, pos_provider, pos_config, bar_settings')
    .eq('id', orgId)
    .single();
  const adapter = opts.adapter ?? adapterFor(org?.pos_provider);
  if (!org || !adapter) return { ran: false, reason: 'not-pull-provider' };

  if ((await takeLease(admin, orgId, now)) === 'held') return { ran: false, reason: 'already-running' };

  const backfill = !!(opts.from && opts.to);
  try {
    const posConfig = (org.pos_config ?? {}) as PosConfig;
    let from = opts.from, to = opts.to;
    if (!from || !to) {
      to = adapter.today(posConfig, now);
      from = addDays(to, -((opts.days ?? DEFAULT_LOOKBACK_DAYS) - 1));
    }

    let payload;
    try {
      payload = await adapter.fetchPayload({
        orgId, admin, posConfig, from, to,
        includeItems: opts.includeItems ?? !backfill,
      });
    } catch (e) {
      const needsReauth = e instanceof NeedsReauthError;
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[pos/sync] org=${orgId} fetch failed:`, message);
      const errors = [`api: ${message}`];
      if (!backfill) await writeOutcome(admin, orgId, errors, null, needsReauth, now);
      return { ran: true, ok: false, errors, summary: null, needsReauth };
    }

    const result = await applyNormalized(
      admin, orgId, { ...payload, backfill },
      { barSettings: (org.bar_settings ?? {}) as Record<string, unknown>, errorPrefix: 'api: ' },
    );
    const summary = toSyncSummary(result);
    if (!backfill) await writeOutcome(admin, orgId, result.errors, summary, false, now);
    if (result.errors.length) console.error(`[pos/sync] org=${orgId}`, result.errors);
    return { ran: true, ok: result.errors.length === 0, errors: result.errors, summary, needsReauth: false };
  } finally {
    await releaseLease(admin, orgId);
  }
}
