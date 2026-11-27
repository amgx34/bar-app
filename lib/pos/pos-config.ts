import type { SyncSummary } from './sync-health';

/**
 * Builders for the `organizations.pos_config` JSON blob.
 *
 * `pos_config` is a single JSON column with more than one writer inside one
 * ingest request: the agent's reported version is recorded straight after
 * authentication, and the sync outcome is written at the end. Both used to
 * spread the copy read at the top of the request, so the later write put a
 * stale `agent_version` back over the one just stored — every sync set the new
 * version and then immediately reverted it, and a bar sat on 1.2.0 for a month
 * while a 1.4.0 agent checked in every five minutes.
 *
 * These are pure and return a NEW object, so a caller threads one evolving
 * value through its writes instead of spreading a stale read twice. Same rule
 * as everywhere else a row has two writers: build from the latest state, never
 * from what you happened to read first.
 */

export type PosConfig = Record<string, unknown>;

/** "rail-2touch-agent/1.4.0 (dotnet)" → "1.4.0" */
export function parseAgentVersion(header: string | null | undefined): string | null {
  return header?.match(/rail-2touch-agent\/([\d.]+)/)?.[1] ?? null;
}

export function applyAgentVersion(cfg: PosConfig, version: string, now: string): PosConfig {
  return { ...cfg, agent_version: version, agent_seen_at: now };
}

export function applySyncOutcome(
  cfg: PosConfig,
  errors: string[],
  summary: SyncSummary | null,
  now: string,
): PosConfig {
  return {
    ...cfg,
    last_sync_at: now,
    // A status line, not a log store.
    last_sync_errors: errors.slice(0, 5).map((e) => e.slice(0, 300)),
    // What the sync actually moved. An absent value means "cannot say" to
    // assessSyncHealth, so write null explicitly rather than omitting the key.
    last_sync_summary: summary ?? null,
  };
}

/**
 * Stores encrypted provider secrets inside pos_config. Only used while the
 * pos_credentials table does not exist (see lib/pos/credentials.ts), and it
 * drops the plaintext `access_token` key older Clover connections stored, in
 * the same write.
 */
export function applyCredentialsEnc(cfg: PosConfig, enc: string): PosConfig {
  const { access_token: _plaintext, ...rest } = cfg;
  void _plaintext;
  return { ...rest, credentials_enc: enc };
}

/**
 * Merges non-secret provider settings (merchant id, region, timezone, cutoff,
 * needs_reauth) over the latest config. Spreads what it is handed, so the caller
 * must pass the config as it stands NOW, never a copy read earlier in the request.
 */
export function applyProviderSettings(cfg: PosConfig, patch: PosConfig): PosConfig {
  return { ...cfg, ...patch };
}

/**
 * The non-secret half of a Toast connection, merged over the latest config. It
 * also drops `client_id` and `client_secret`: connections made before the
 * encrypted credentials store kept both here in plaintext, and this column is
 * selected into every membership row (lib/org.ts), so reconnecting must scrub
 * them rather than leave them next to the new settings.
 */
export function applyToastConnection(cfg: PosConfig, settings: PosConfig): PosConfig {
  const { client_id: _id, client_secret: _secret, ...rest } = cfg;
  void _id; void _secret;
  return { ...rest, ...settings };
}
