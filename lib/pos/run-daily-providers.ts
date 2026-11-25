import { createAdminClient } from '@/lib/supabase/admin';
import { runProviderSync, type SyncRunResult } from '@/lib/pos/sync-run';

/**
 * The nightly pull for every Clover and Toast bar, from the one daily cron.
 *
 * Orgs run one after another, each in its own try and under its own time limit,
 * so one bar's failure or hang costs no other bar its night. The whole pass also
 * has a budget inside the route's maxDuration (60s: 40s to start orgs plus at most 15s for the last one); orgs it did not reach are the
 * ones with the oldest last_sync_at, so they go first next time, and the
 * 3-date lookback in runProviderSync closes the gap they missed.
 */

export type DailySyncResult = {
  scanned: number;
  synced: number;
  failed: number;
  /** Lease held by another run: that run is doing the work. */
  skipped: number;
  /** Not reached before the budget ran out. */
  deferred: number;
  errors: string[];
};

type Deps = {
  listOrgs?: () => Promise<{ id: string }[]>;
  sync?: (orgId: string) => Promise<SyncRunResult>;
  now?: () => number;
  budgetMs?: number;
  perOrgMs?: number;
};

async function listConnectedOrgs(): Promise<{ id: string }[]> {
  // admin-scope-ok: the cron routes across every org by design; each org is then
  // synced by id through runProviderSync, which scopes all of its own queries.
  const { data, error } = await createAdminClient()
    .from('organizations')
    .select('id, pos_provider, pos_config')
    .in('pos_provider', ['clover', 'toast']);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((o) => {
      const c = (o.pos_config ?? {}) as Record<string, unknown>;
      // Connected, and not waiting on a person to reconnect: retrying a dead login nightly only adds noise.
      return !c.needs_reauth && !!(o.pos_provider === 'clover' ? c.merchant_id : c.restaurant_guid);
    })
    .sort((a, b) => lastSync(a.pos_config) - lastSync(b.pos_config))
    .map((o) => ({ id: o.id as string }));
}

const lastSync = (cfg: unknown) => {
  const t = Date.parse(String((cfg as Record<string, unknown> | null)?.last_sync_at ?? ''));
  return Number.isFinite(t) ? t : 0;
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`timed out after ${Math.round(ms / 1000)}s`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

export async function runDailyProviderSync(deps: Deps = {}): Promise<DailySyncResult> {
  const now = deps.now ?? Date.now;
  const budgetMs = deps.budgetMs ?? 40_000;
  const perOrgMs = deps.perOrgMs ?? 15_000;
  const sync = deps.sync ?? ((id: string) => runProviderSync(id));
  const out: DailySyncResult = { scanned: 0, synced: 0, failed: 0, skipped: 0, deferred: 0, errors: [] };

  let orgs: { id: string }[];
  try {
    orgs = await (deps.listOrgs ?? listConnectedOrgs)();
  } catch (e) {
    out.errors.push(`listing orgs: ${e instanceof Error ? e.message : String(e)}`);
    return out;
  }
  out.scanned = orgs.length;

  const start = now();
  for (let i = 0; i < orgs.length; i++) {
    if (now() - start >= budgetMs) { out.deferred = orgs.length - i; break; }
    const { id } = orgs[i];
    try {
      const r = await withTimeout(sync(id), perOrgMs);
      if (!r.ran) out.skipped++;
      else if (r.ok) out.synced++;
      else { out.failed++; out.errors.push(`${id}: ${r.needsReauth ? 'needs reconnect' : r.errors[0] ?? 'failed'}`); }
    } catch (e) {
      out.failed++;
      out.errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}
