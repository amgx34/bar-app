/**
 * POST /api/2touch/ingest
 *
 * Receives Z Report, EW Report, and Item Audit data from the local
 * 2Touch SQL agent running on each bar's POS server.
 *
 * MULTI-TENANT ROUTING:
 *   Each agent includes its org_id in the payload.
 *   Authentication is validated against THAT org's unique agent_token
 *   (stored in pos_config.agent_token), so 1000 different bars each
 *   have their own secret — no shared credential, no cross-org leakage.
 *
 * Security: HMAC-SHA256 in X-Rail-Signature, keyed by the org's agent_token.
 */


import { NextRequest, NextResponse } from 'next/server';
import { createHmac }                from 'crypto';
import { createAdminClient }         from '@/lib/supabase/admin';
import type { SyncSummary } from '@/lib/pos/sync-health';
import { parseAgentVersion, applyAgentVersion, applySyncOutcome } from '@/lib/pos/pos-config';
import { applyNormalized, toSyncSummary } from '@/lib/pos/ingest';
import type { NormalizedPayload } from '@/lib/pos/normalized';

export const runtime     = 'nodejs';
export const maxDuration = 30;

// ── Wire format ───────────────────────────────────────────────────────────────

/**
 * The body the agent posts: the normalized payload plus the routing org_id, with
 * the agent's own names for two fields. Every section but z/ew/items is optional
 * because an agent older than the release that added it sends neither, and its
 * request must still succeed.
 */
type Payload = Omit<NormalizedPayload, 'errors' | 'zReports'> & {
  org_id:    string;           // REQUIRED, which bar is sending this
  zReports:  (Omit<NormalizedPayload['zReports'][number], 'cash_tips'> & { cash_tips: number })[];
  /**
   * Feeds that were configured on the POS box, ran, and threw. Absent from every
   * agent older than the release that added it, so absence means "cannot
   * report", never "nothing went wrong". See NormalizedPayload.errors.
   */
  agentErrors?: string[];
};

// ── Auth: per-org HMAC ────────────────────────────────────────────────────────

async function resolveOrgAndVerify(
  body:    string,
  sig:     string,
  orgId:   string,
): Promise<{
  valid: boolean;
  orgId: string | null;
  posConfig: Record<string, unknown>;
  barSettings: Record<string, unknown>;
}> {
  const supabase = createAdminClient();

  // Fetch the specific org — never scan all orgs
  const { data: org } = await supabase
    .from('organizations')
    // bar_settings comes along for the org-wide pour default, the last step of
    // the item -> category -> org chain in lib/pos/pour.ts.
    .select('id, pos_provider, pos_config, bar_settings')
    .eq('id', orgId)
    .eq('pos_provider', '2touch')
    .single();

  if (!org) return { valid: false, orgId: null, posConfig: {}, barSettings: {} };

  const cfg         = (org.pos_config ?? {}) as Record<string, unknown>;
  const settings    = (org.bar_settings ?? {}) as Record<string, unknown>;
  const agentToken  = cfg.agent_token as string | null;

  // If no token stored yet, fall back to the global TWOTOUCH_INGEST_SECRET
  // (backwards-compat for initial setup before per-org tokens existed)
  const secret = agentToken ?? process.env.TWOTOUCH_INGEST_SECRET;
  if (!secret) return { valid: false, orgId: null, posConfig: cfg, barSettings: settings };

  // Sign the RAW request body bytes — never a re-serialized copy.
  // The agent signs exactly the bytes it sends, so the signature is identical
  // regardless of the agent's language/JSON serializer (number formatting like
  // 4521.50 vs 4521.5, and non-ASCII escaping, differ between JSON.stringify
  // and .NET's System.Text.Json). Backward-compatible with the Node agent,
  // which already signs the exact string it POSTs.
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return { valid: expected === sig, orgId: org.id, posConfig: cfg, barSettings: settings };
}

/**
 * Stores the last sync time and any errors from it on the org.
 *
 * Written on every sync rather than only on failure, so "last sync succeeded at
 * 21:05" is a positive signal and not merely the absence of a bad one. Errors
 * are truncated: this is a status line, not a log store.
 */
async function recordSyncOutcome(
  orgId: string,
  posConfig: Record<string, unknown>,
  errors: string[],
  summary?: SyncSummary,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('organizations')
    .update({
      // Built from the config this was handed, which must be the latest known
      // state rather than the copy read at the top of the request — see
      // recordAgentVersion.
      pos_config: applySyncOutcome(posConfig, errors, summary ?? null, new Date().toISOString()),
    })
    .eq('id', orgId);

  // Never fail an otherwise-good ingest because the status line would not save.
  if (error) console.warn('[2touch] could not record sync outcome:', error.message);
}

/**
 * Records the agent version reported in X-Rail-Agent.
 *
 * Written only when it actually changes. A sync runs every five minutes per
 * bar, so an unconditional write would be ~288 pointless updates a day per
 * organisation, on the row that also holds the auth token.
 */
async function recordAgentVersion(
  orgId: string,
  posConfig: Record<string, unknown>,
  userAgent: string | null,
): Promise<Record<string, unknown>> {
  const version = parseAgentVersion(userAgent);
  if (!version || posConfig.agent_version === version) return posConfig;

  const next = applyAgentVersion(posConfig, version, new Date().toISOString());

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('organizations')
    .update({ pos_config: next })
    .eq('id', orgId);

  // Non-fatal by design: failing an entire night's ingest because a version
  // string could not be filed would be a poor trade.
  if (error) {
    console.warn('[2touch] could not record agent version:', error.message);
    return posConfig;
  }

  // Returned, not discarded. pos_config is one JSON blob and recordSyncOutcome
  // writes it again at the end of this same request — from whatever object it
  // is handed. Hand it the stale read and it spreads the old agent_version back
  // over the one just stored, so the version never changes however many times
  // the agent reports it.
  return next;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get('x-rail-signature') ?? '';

  // Parse just enough to get org_id for auth
  let orgId: string;
  try {
    const parsed = JSON.parse(body) as Partial<Payload>;
    orgId = parsed.org_id ?? '';
    if (!orgId) return NextResponse.json({ error: 'org_id required in payload' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { valid, orgId: resolvedOrgId, posConfig: storedConfig, barSettings } =
    await resolveOrgAndVerify(body, sig, orgId);

  // Mutable because pos_config is one JSON blob written twice in this request.
  // Each writer returns the state it stored and the next builds on that, so a
  // later write cannot spread a stale copy back over an earlier one.
  let posConfig = storedConfig;
  if (!valid || !resolvedOrgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // After authentication, so an unauthenticated caller cannot write anything.
  // Reassigned, so the sync outcome written at the end of this request builds
  // on the version just stored instead of reverting it.
  posConfig = await recordAgentVersion(resolvedOrgId, posConfig, req.headers.get('x-rail-agent'));

  const data = JSON.parse(body) as Payload;
  const result = await applyNormalized(
    createAdminClient(),
    resolvedOrgId,
    {
      source:      data.source,
      pulledAt:    data.pulledAt,
      // 2Touch always reports cash tips; a missing one has always been stored
      // as 0 here, which stays true. Other sources omit the field instead.
      zReports:    data.zReports?.map(z => ({ ...z, cash_tips: z.cash_tips ?? 0 })) ?? [],
      ewReports:   data.ewReports ?? [],
      itemAudit:   data.itemAudit ?? [],
      hourlySales: data.hourlySales,
      serverSales: data.serverSales,
      errors:      data.agentErrors,
      backfill:    data.backfill,
    },
    { barSettings, errorPrefix: 'agent: ' },
  );

  // A backfill deliberately does not touch the sync status. The data it carries
  // is written exactly as any other ingest writes it; only the status line is
  // left for the live sync to own. Otherwise a long backfill would make a
  // healthy bar look dead, and leave the status describing last March.
  if (!data.backfill) {
    await recordSyncOutcome(resolvedOrgId, posConfig, result.errors, toSyncSummary(result));
  }

  if (result.errors.length) {
    console.error(`[2touch/ingest] org=${resolvedOrgId} FAILED`, result.errors);
  } else {
    console.log(`[2touch/ingest] org=${resolvedOrgId}`, result);
  }
  return NextResponse.json(result);
}
