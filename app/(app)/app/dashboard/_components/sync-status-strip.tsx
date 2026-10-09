import { CheckCircle2, AlertTriangle, CloudOff, Clock } from 'lucide-react';
import type { SyncHealth, SyncStatus } from '@/lib/pos/sync-health';

/**
 * Whether the POS agent is still feeding this bar.
 *
 * Everything serious that has gone wrong in this system went wrong silently:
 * depletion failing on every sync behind a swallowed error, corrected hours
 * reverting minutes later, a tax flag misstating revenue for months. The ingest
 * already recorded enough to catch that early and nothing displayed it. This is
 * that display.
 *
 * Rendered only when there is an agent to have an opinion about — a Clover bar
 * seeing a permanent "never synced" would teach everyone to ignore the strip.
 */

const STYLES: Record<Exclude<SyncStatus, 'not-configured'>, {
  icon: typeof CheckCircle2;
  wrap: string;
  dot: string;
  label: string;
}> = {
  healthy: {
    icon: CheckCircle2,
    wrap: 'border-emerald-500/30 bg-emerald-500/5',
    dot: 'text-emerald-600 dark:text-emerald-400',
    label: 'POS connected',
  },
  errors: {
    icon: AlertTriangle,
    wrap: 'border-destructive/40 bg-destructive/5',
    dot: 'text-destructive',
    label: 'Sync errors',
  },
  /*
    Amber, not red, and deliberately not "connected".

    This is the state a bar sat in for a month while the strip read green: the
    agent checking in every five minutes and bringing nothing back. It is also
    what a closed bar looks like, so it must not accuse — but it must also
    never again be indistinguishable from a healthy night.
  */
  'no-data': {
    icon: AlertTriangle,
    wrap: 'border-amber-500/40 bg-amber-500/5',
    dot: 'text-amber-600 dark:text-amber-400',
    label: 'No sales received',
  },
  stale: {
    icon: Clock,
    wrap: 'border-amber-500/40 bg-amber-500/5',
    dot: 'text-amber-600 dark:text-amber-400',
    label: 'No recent data',
  },
  down: {
    icon: CloudOff,
    wrap: 'border-destructive/40 bg-destructive/5',
    dot: 'text-destructive',
    label: 'POS not reporting',
  },
};

/**
 * Only the figures worth a glance; zeroes are dropped rather than shown as noise.
 *
 * EXCEPT when every figure is zero. Dropping them all rendered the emptiest
 * possible sync as no text at all, sitting under a green "POS connected" — the
 * absence of a number read as "nothing to mention" when it meant "nothing
 * arrived". A sync that moved nothing now says so in words.
 */
function countLine(health: SyncHealth): string | null {
  const s = health.summary;
  const parts: string[] = [];
  if (s.zReports) parts.push(`${s.zReports} Z ${s.zReports === 1 ? 'day' : 'days'}`);
  if (s.ewReports) parts.push(`${s.ewReports} shifts`);
  if (s.itemAudit) parts.push(`${s.itemAudit} items`);
  if (s.stockMoved) parts.push(`${s.stockMoved} stock moves`);
  if (parts.length) return parts.join(' · ');
  return health.status === 'no-data' ? 'nothing received on the last sync' : null;
}

export function SyncStatusStrip({ health }: { health: SyncHealth }) {
  if (health.status === 'not-configured') return null;

  const style = STYLES[health.status];
  const Icon = style.icon;
  const counts = countLine(health);

  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${style.wrap}`}>
      <div className="flex flex-wrap items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.dot}`} aria-hidden />

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
            {style.label}
            {health.agentVersion && (
              <span className="text-xs font-normal text-muted-foreground">
                agent {health.agentVersion}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {health.message}
          </p>

          {counts && (
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              Last sync: {counts}
            </p>
          )}

          {/* Shown, not summarised. "3 errors" tells an operator nothing they can
              act on, and these are the messages that would otherwise only exist
              in a log nobody reads. */}
          {health.errors.length > 0 && (
            <ul className="mt-2 space-y-1">
              {health.errors.map((err, i) => (
                <li
                  key={i}
                  className="rounded border border-destructive/30 bg-background/60 px-2 py-1 font-mono text-[11px] leading-snug text-destructive"
                >
                  {err}
                </li>
              ))}
            </ul>
          )}

          {/* Protected shifts are a GOOD outcome, so they are reported here
              rather than beside the errors: the sync deliberately left a
              manager's correction alone. */}
          {(health.summary.shiftsProtected ?? 0) > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {health.summary.shiftsProtected} corrected{' '}
              {health.summary.shiftsProtected === 1 ? 'shift was' : 'shifts were'} kept
              — the POS did not overwrite them.
            </p>
          )}

          {(health.summary.unresolvedItems ?? 0) > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {health.summary.unresolvedItems} sold{' '}
              {health.summary.unresolvedItems === 1 ? 'item' : 'items'} matched nothing in
              inventory, so they moved no stock.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
