import { isConnected, type PosConfigShape } from '@/lib/pos/sync-health';

/** "Sync now" refuses inside this window; the stale-on-view refresh waits for the longer one. */
const COOLDOWN_SECONDS = 120;
const STALE_ON_VIEW_MINUTES = 30;

const lastSyncMs = (cfg: PosConfigShape) => {
  const t = Date.parse(String(cfg.last_sync_at ?? ''));
  return Number.isFinite(t) ? t : null;
};

/** Why a manual sync should not run right now, or null when it may. */
export function syncCooldownMessage(cfg: PosConfigShape, now: Date): string | null {
  const t = lastSyncMs(cfg);
  if (t === null) return null;
  const seconds = (now.getTime() - t) / 1000;
  if (seconds >= COOLDOWN_SECONDS) return null;
  const minutes = Math.floor(seconds / 60);
  return `Synced ${minutes < 1 ? 'less than a minute' : `${minutes} minute`} ago. Wait a couple of minutes before syncing again.`;
}

/** Should opening the dashboard trigger a background pull? Never for 2Touch, whose agent pushes. */
export function isStaleOnView(provider: string | null | undefined, cfg: PosConfigShape, now: Date): boolean {
  if (provider !== 'clover' && provider !== 'toast') return false;
  if (!isConnected(provider, cfg) || cfg.needs_reauth) return false;
  const t = lastSyncMs(cfg);
  return t === null || now.getTime() - t > STALE_ON_VIEW_MINUTES * 60_000;
}
