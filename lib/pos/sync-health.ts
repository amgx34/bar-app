/**
 * Is the POS agent actually still feeding us?
 *
 * Pure — takes a clock as an argument rather than reading one, so the bands
 * below can be tested rather than hoped at.
 *
 * WHY THIS EXISTS
 *
 * Every serious defect found in this system so far has been silent. Depletion
 * failed on every sync for days behind a swallowed 42702. Books understated
 * revenue for months on a tax flag nobody re-read. Corrected hours reverted
 * within five minutes of being typed. In each case the data simply stopped
 * being right, and somebody eventually noticed a number looked odd.
 *
 * The ingest already records everything needed to catch that class early — it
 * writes `last_sync_at` on every sync specifically so that "succeeded at 21:05"
 * is a positive signal rather than merely the absence of a complaint — and
 * nothing ever displayed it. This turns that into something an operator sees.
 */

export type SyncStatus =
  /** Syncing normally. */
  | 'healthy'
  /** Ran, but reported errors. Data may be partially applied. */
  | 'errors'
  /** Nothing heard for a while. The agent or the POS box may be down. */
  | 'stale'
  /** Silent long enough that data is certainly missing. */
  | 'down'
  /** No agent configured for this bar. Not a fault. */
  | 'not-configured';

/**
 * How long silence is tolerated before it is worth saying something.
 *
 * The agent syncs every five minutes as a Windows service, so an hour of
 * nothing already means several dozen missed runs. But a POS box that is simply
 * switched off overnight looks identical to a broken agent from here, which is
 * why the first band warns rather than alarms, and the copy says so.
 */
const STALE_AFTER_MINUTES = 60;
const DOWN_AFTER_MINUTES = 12 * 60;

export type SyncSummary = {
  zReports?: number;
  ewReports?: number;
  shiftsProtected?: number;
  itemAudit?: number;
  stockMoved?: number;
  unresolvedItems?: number;
  /** Hourly rows written this sync. Zero for agents that do not send them. */
  hoursRecorded?: number;
  /** Per-server rows written this sync. Zero for agents that do not send them. */
  serversRecorded?: number;
};

export type PosConfigShape = {
  agent_token?: unknown;
  last_sync_at?: string | null;
  last_sync_errors?: unknown;
  last_sync_summary?: SyncSummary | null;
  agent_version?: string | null;
};

export type SyncHealth = {
  status: SyncStatus;
  /** Minutes since the last sync, or null when it has never run. */
  minutesAgo: number | null;
  lastSyncAt: string | null;
  errors: string[];
  summary: SyncSummary;
  agentVersion: string | null;
  /** One sentence an operator can act on. */
  message: string;
};

function minutesBetween(thenIso: string, now: Date): number | null {
  const then = Date.parse(thenIso);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.round((now.getTime() - then) / 60000));
}

/**
 * A bare duration — "13 hours" — for sentences that supply their own preposition.
 *
 * Separate from describeAge because that one ends in "ago", which reads fine
 * after "last checked in" and produces "for 13 hours ago" after "for".
 */
export function describeDuration(minutes: number | null): string {
  if (minutes === null) return 'an unknown time';
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Human-readable gap ending in "ago", for "last checked in ...". */
export function describeAge(minutes: number | null): string {
  if (minutes === null) return 'never';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function assessSyncHealth(
  posConfig: PosConfigShape | null | undefined,
  posProvider: string | null | undefined,
  now: Date = new Date(),
): SyncHealth {
  const cfg = posConfig ?? {};
  const errors = Array.isArray(cfg.last_sync_errors)
    ? cfg.last_sync_errors.filter((e): e is string => typeof e === 'string')
    : [];
  const summary = (cfg.last_sync_summary ?? {}) as SyncSummary;
  const agentVersion = typeof cfg.agent_version === 'string' ? cfg.agent_version : null;

  const base = { errors, summary, agentVersion };

  // A bar with no agent is not broken. Reporting "never synced" for every
  // Clover or manual-upload bar would train everyone to ignore this strip.
  if (posProvider !== '2touch' || !cfg.agent_token) {
    return {
      ...base,
      status: 'not-configured',
      minutesAgo: null,
      lastSyncAt: null,
      message: 'No POS agent is set up for this bar.',
    };
  }

  const lastSyncAt = typeof cfg.last_sync_at === 'string' ? cfg.last_sync_at : null;
  if (!lastSyncAt) {
    return {
      ...base,
      status: 'down',
      minutesAgo: null,
      lastSyncAt: null,
      message: 'The agent is configured but has never checked in. Confirm it is installed and running on the POS.',
    };
  }

  const minutesAgo = minutesBetween(lastSyncAt, now);

  // Errors outrank silence: a sync that ran two minutes ago and failed is a
  // more urgent thing to say than one that ran an hour ago and worked.
  if (errors.length > 0) {
    return {
      ...base,
      status: 'errors',
      minutesAgo,
      lastSyncAt,
      message: `Last sync reported ${errors.length} ${errors.length === 1 ? 'error' : 'errors'}. Some data may not have been applied.`,
    };
  }

  if (minutesAgo === null || minutesAgo >= DOWN_AFTER_MINUTES) {
    return {
      ...base,
      status: 'down',
      minutesAgo,
      lastSyncAt,
      message: `No data received for ${describeDuration(minutesAgo)}. Sales and hours since then are missing.`,
    };
  }

  if (minutesAgo >= STALE_AFTER_MINUTES) {
    return {
      ...base,
      status: 'stale',
      minutesAgo,
      lastSyncAt,
      message: `Nothing heard for ${describeDuration(minutesAgo)}. Normal if the POS is switched off, otherwise check the agent.`,
    };
  }

  return {
    ...base,
    status: 'healthy',
    minutesAgo,
    lastSyncAt,
    message: `Syncing normally — last checked in ${describeAge(minutesAgo)}.`,
  };
}
