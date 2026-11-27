'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Leaf, Flame, Monitor, CheckCircle, AlertTriangle,
  RefreshCw, Unplug, ExternalLink, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { assessSyncHealth, describeAge, type PosConfigShape } from '@/lib/pos/sync-health';
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';
import { friendlySyncError } from '@/lib/pos/sync-errors';
import {
  syncCloverInventory, syncCloverSales,
  syncToastSales, syncToastInventory,
  save2TouchConfig, triggerTwoTouchPoll, get2TouchAgentConfig, type TwoTouchAgentConfig,
  disconnectPOS,
} from '../actions';
import { ToastConnectForm } from '@/app/(app)/setup/pos/toast/_components/toast-connect-form';
import type { Role } from '@/lib/permissions';

const POS_META = {
  clover:  { name: 'Clover',    icon: Leaf,    color: 'text-green-700 dark:text-green-300',  badge: 'bg-green-400/15 text-green-700 dark:text-green-300 border-green-600 dark:border-green-400/30' },
  toast:   { name: 'Toast',     icon: Flame,   color: 'text-orange-700 dark:text-orange-300', badge: 'bg-orange-400/15 text-orange-700 dark:text-orange-300 border-orange-600 dark:border-orange-400/30' },
  '2touch':{ name: '2TouchPOS', icon: Monitor, color: 'text-blue-700 dark:text-blue-300',   badge: 'bg-blue-400/15 text-blue-700 dark:text-blue-300 border-blue-600 dark:border-blue-400/30' },
} as const;

interface Props {
  orgId:          string;
  role:           Role;
  posProvider:    'clover' | 'toast' | '2touch' | null;
  posConfig:      Record<string, unknown>;
  cloverAuthUrl:  string | null;
  flashConnected: boolean;
  flashError?:    string;
}

// ── 2Touch configuration panel ───────────────────────────────────────────────

function TwoTouchPanel({
  posConfig, isConnected, onConnected, onDisconnect, role,
}: {
  posConfig:   Record<string, unknown>;
  isConnected: boolean;
  onConnected: () => void;
  onDisconnect: () => void;
  role: Role;
}) {
  const existingSender = (posConfig.twotouch_sender_email as string | undefined) ?? '';
  // Written by the ingest route from the X-Rail-Agent header, and only when it
  // changes — see recordAgentVersion in app/api/2touch/ingest/route.ts.
  const agentVersion = posConfig.agent_version as string | undefined;
  const agentSeenAt  = posConfig.agent_seen_at as string | undefined;
  const [senderEmail, setSenderEmail] = useState(existingSender);
  const [saving,      setSaving]      = useState(false);
  const [polling,     setPolling]     = useState(false);
  const [lastResult,  setLastResult]  = useState<{ processed: number; zReports: number; empReports: number } | null>(null);
  const [agentCreds,  setAgentCreds]  = useState<TwoTouchAgentConfig | null>(null);
  const [copied,      setCopied]      = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const creds = await save2TouchConfig(senderEmail);
      setAgentCreds(creds);
      toast.success('2TouchPOS configured. Copy the pairing code below for the installer');
      onConnected();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally { setSaving(false); }
  }

  // Load existing creds if already configured
  useEffect(() => {
    if (isConnected && !agentCreds) {
      get2TouchAgentConfig().then(c => { if (c) setAgentCreds(c); }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  function copyPairingCode() {
    if (!agentCreds) return;
    navigator.clipboard?.writeText(agentCreds.pairingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handlePollNow() {
    setPolling(true);
    try {
      const res = await triggerTwoTouchPoll();
      setLastResult(res);
      if (res.processed > 0) {
        toast.success(`Processed ${res.processed} email${res.processed > 1 ? 's' : ''} - ${res.zReports} Z reports, ${res.empReports} shift reports`);
      } else {
        toast.info('No new 2Touch emails found in inbox');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Poll failed');
    } finally { setPolling(false); }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Monitor className="h-4 w-4 text-blue-700 dark:text-blue-300" />
        <h3 className="text-sm font-semibold">2TouchPOS</h3>
        <span className="text-xs text-muted-foreground">Email-based · auto-sync every 15 min</span>
        {isConnected && (
          <Badge variant="outline" className="text-emerald-800 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10 ml-auto">Active</Badge>
        )}
      </div>

      {/* How it works */}
      <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-3 space-y-1.5 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">How 2Touch integration works:</p>
        <ol className="list-decimal list-inside space-y-1 leading-relaxed">
          <li>In 2Touch Cloud, set nightly Z reports to email to the Rail reports address. We will send you that address when we set up your bar: <a className="underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a></li>
          <li>Rail checks for new reports regularly and adds them for you</li>
          <li>New report emails are parsed by AI and inserted into your Dashboard &amp; Payroll automatically</li>
          <li>Each email is processed exactly once, so duplicates are skipped</li>
        </ol>
      </div>

      {/* Sender email config */}
      <div className="space-y-1.5">
        <Label className="text-xs">2Touch Report Sender Email</Label>
        <div className="flex gap-2">
          <Input
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
            placeholder="e.g. noreply@2touchpos.com or reports@yourbar.com"
            className="h-11 text-sm"
            autoComplete="off"
          />
          <Button size="sm" onClick={handleSave} disabled={saving} className="shrink-0 gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            {isConnected ? 'Update' : 'Activate'}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          The email address 2Touch sends reports from. Rail will only parse emails matching this sender.
          Leave blank to auto-detect any email mentioning &quot;2TouchPOS&quot; or &quot;Z Report&quot;.
        </p>
      </div>

      {/* Pairing code — the agent's setup wizard asks for exactly this one string */}
      {isConnected && agentCreds && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">
              Pairing code: the agent installer asks for this
            </p>
            <button
              onClick={copyPairingCode}
              className="text-xs text-primary hover:underline"
            >
              {copied ? '✓ Copied' : 'Copy pairing code'}
            </button>
          </div>
          <p className="rounded bg-background/60 border p-2 text-[11px] font-mono break-all select-all text-foreground">
            {agentCreds.pairingCode}
          </p>
          <p className="text-[10px] text-muted-foreground">
            On the POS server, double-click <span className="font-mono">rail-setup.exe</span> and paste this
            when it asks. The code carries this bar&apos;s unique token. Never share it with another bar.
          </p>
        </div>
      )}

      {/* Reported by the agent on every sync via X-Rail-Agent, so this is
          evidence the agent is actually running — not just that it was
          installed once. */}
      {isConnected && agentVersion && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">Agent version</span>
          <span className="font-mono text-xs font-medium">{agentVersion}</span>
          {agentSeenAt && (
            <span className="text-[11px] text-muted-foreground">
              · last sync {new Date(agentSeenAt).toLocaleString()}
            </span>
          )}
          <span className="w-full text-[10px] text-muted-foreground">
            To update it, run <span className="font-mono">rail-update.exe</span> on the POS server.
          </span>
        </div>
      )}

      {isConnected && (
        <div className="flex flex-wrap gap-2 items-center pt-1">
          <Button size="sm" variant="outline" onClick={handlePollNow} disabled={polling} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${polling ? 'animate-spin' : ''}`} />
            {polling ? 'Checking inbox…' : 'Check for reports now'}
          </Button>
          {lastResult && (
            <span className="text-xs text-muted-foreground">
              Last check: {lastResult.processed} processed ({lastResult.zReports} Z reports, {lastResult.empReports} shift reports)
            </span>
          )}
          {role === 'owner' && (
            <Button size="sm" variant="outline" onClick={onDisconnect} className="gap-2 text-muted-foreground ml-auto">
              <Unplug className="h-3.5 w-3.5" /> Disconnect
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sync status for a pulled provider (Clover, Toast) ───────────────────────

/**
 * What the last sync did, in words. Rail pulls these POS systems once a night
 * and when someone opens the app, so "last synced" is the figure that matters.
 */
function PullStatus({ provider, posConfig }: { provider: 'clover' | 'toast'; posConfig: Record<string, unknown> }) {
  const health = assessSyncHealth(posConfig as PosConfigShape, provider);
  const bad = health.status === 'errors' || health.status === 'down' || health.status === 'needs-reauth';
  const warn = health.status === 'stale' || health.status === 'no-data';
  const Icon = bad || warn ? AlertTriangle : CheckCircle;
  const tone = bad ? 'text-destructive' : warn ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300';
  const s = health.summary;
  const counts = [
    s.zReports ? `${s.zReports} ${s.zReports === 1 ? 'night' : 'nights'} of sales` : null,
    s.ewReports ? `${s.ewReports} shifts` : null,
    s.itemAudit ? `${s.itemAudit} items sold` : null,
  ].filter(Boolean).join(', ');

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2" role="status">
      <p className={`flex items-start gap-2 text-sm ${tone}`}>
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{health.message}</span>
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {health.lastSyncAt ? `Last sync ${describeAge(health.minutesAgo)}${counts ? `: ${counts}` : ''}.` : 'No sync has run yet.'}
      </p>
      {health.errors.length > 0 && (
        <ul className="space-y-1.5">
          {health.errors.map((e, i) => (
            <li key={i} className="text-xs leading-relaxed text-foreground">{friendlySyncError(e)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function POSPanel({ role, posProvider, posConfig, cloverAuthUrl, flashConnected, flashError }: Props) {
  const [provider,      setProvider]      = useState(posProvider);
  const [syncingInv,    setSyncingInv]    = useState(false);
  const [syncingSales,  setSyncingSales]  = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen,   setConfirmOpen]   = useState(false);
  const router = useRouter();

  const canManage         = role === 'owner' || role === 'manager';
  // The login itself lives in the encrypted credentials store, not here. A zone
  // is required: without one Rail cannot say which night a sale belongs to.
  const isCloverConnected = provider === 'clover' && !!posConfig.merchant_id && !!posConfig.timezone && !posConfig.needs_reauth;
  // The login lives in the encrypted store. Toast reports its own zone and closeout hour at connect.
  const isToastConnected  = provider === 'toast'  && !!posConfig.restaurant_guid && !!posConfig.timezone && !posConfig.needs_reauth;
  const isConnected       = isCloverConnected || isToastConnected;

  useEffect(() => {
    if (flashConnected) toast.success('Clover connected successfully!');
    if (flashError) {
      const messages: Record<string, string> = {
        clover_missing_params:  'OAuth response was incomplete. Try again',
        clover_unauthorized:    'You do not have permission to connect a POS',
        clover_token_failed:    'Clover rejected the authorization. Try again',
        clover_invalid_token:   'Clover returned an invalid token',
        clover_save_failed:     'Connected but failed to save. Contact support',
        clover_timezone:        'Connected, but Clover did not report your time zone. Authorize again and pick one.',
      };
      toast.error(messages[flashError] ?? `Connection error: ${flashError}`);
    }
  }, [flashConnected, flashError]);

  // ── Clover handlers ─────────────────────────────────────────────────────────

  async function handleCloverSyncInv() {
    setSyncingInv(true);
    try {
      const res = await syncCloverInventory();
      toast.success(`Inventory synced: ${res.created} created, ${res.updated} updated${res.skipped ? `, ${res.skipped} skipped` : ''}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Sync failed'); }
    finally { setSyncingInv(false); }
  }

  async function handleCloverSyncSales() {
    setSyncingSales(true);
    try {
      const res = await syncCloverSales(3);
      toast.success(`Sales synced: ${res.upserted} day${res.upserted !== 1 ? 's' : ''} updated`);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Sync failed'); }
    finally { setSyncingSales(false); router.refresh(); }
  }

  // ── Toast handlers ──────────────────────────────────────────────────────────

  async function handleToastSyncSales() {
    setSyncingSales(true);
    try {
      const res = await syncToastSales(3);
      toast.success(`Sales synced: ${res.upserted} day${res.upserted !== 1 ? 's' : ''} updated`);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Sync failed'); }
    finally { setSyncingSales(false); router.refresh(); }
  }

  async function handleToastSyncInv() {
    setSyncingInv(true);
    try {
      const res = await syncToastInventory();
      toast.success(`Menu synced: ${res.created} created, ${res.updated} updated${res.skipped ? `, ${res.skipped} skipped` : ''}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Sync failed'); }
    finally { setSyncingInv(false); }
  }

  // ── Disconnect ──────────────────────────────────────────────────────────────

  function handleDisconnect() { setConfirmOpen(true); }

  async function confirmDisconnect() {
    setDisconnecting(true);
    try {
      await disconnectPOS();
      setProvider(null);
      setConfirmOpen(false);
      toast.success('POS disconnected');
      router.refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to disconnect'); }
    finally { setDisconnecting(false); }
  }

  const busy = syncingInv || syncingSales;

  return (
    <div className="space-y-6">
      {/* ── Status bar ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Connection Status</h3>
        </div>

        {provider ? (
          <div className="flex items-center gap-4">
            {(() => {
              const meta = POS_META[provider as keyof typeof POS_META];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <>
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${meta.badge}`}>
                    <Icon className={`h-5 w-5 ${meta.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{meta.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      {isConnected ? (
                        <><CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> Connected &amp; ready to sync</>
                      ) : (
                        <><AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" /> Selected, authorization required</>
                      )}
                    </p>
                  </div>
                  {isConnected && (
                    <Badge variant="outline" className="text-emerald-800 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10">
                      Active
                    </Badge>
                  )}
                </>
              );
            })()}
          </div>
        ) : (
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0" />
            <p className="text-sm">No POS connected. Choose a provider below.</p>
          </div>
        )}
      </div>

      {/* ── Clover section ──────────────────────────────────────────────────── */}
      {canManage && (provider === 'clover' || !isConnected) && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Leaf className="h-4 w-4 text-green-700 dark:text-green-300" />
            <h3 className="text-sm font-semibold">Clover</h3>
            <span className="text-xs text-muted-foreground">Secure sign-in through Clover</span>
          </div>

          {!isCloverConnected ? (
            cloverAuthUrl ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {posConfig.needs_reauth
                    ? 'Clover no longer accepts the saved login. Authorize again to resume syncing.'
                    : 'You\u2019ll be redirected to Clover to approve access. Rail never stores your Clover password.'}
                </p>
                <a href={cloverAuthUrl}>
                  <Button size="sm" className="h-11 gap-2 bg-green-700 hover:bg-green-800 text-white">
                    <ExternalLink className="h-3.5 w-3.5" /> Authorize with Clover
                  </Button>
                </a>
              </div>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {/* One span, or each text run and the link become separate flex columns on a phone. */}
                <span className="min-w-0">
                  Connecting Clover is not switched on yet. Email <a className="break-all underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> and we will turn it on for your bar.
                </span>
              </p>
            )
          ) : (
            <div className="space-y-3">
              <PullStatus provider="clover" posConfig={posConfig} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleCloverSyncSales} disabled={busy} className="min-h-11 gap-2 sm:min-h-0">
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingSales ? 'animate-spin' : ''}`} />
                  {syncingSales ? 'Syncing…' : 'Sync now'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleCloverSyncInv} disabled={busy} className="min-h-11 gap-2 sm:min-h-0">
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingInv ? 'animate-spin' : ''}`} />
                  {syncingInv ? 'Syncing…' : 'Import item catalog'}
                </Button>
                {role === 'owner' && (
                  <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={disconnecting} className="min-h-11 gap-2 text-muted-foreground sm:min-h-0">
                    <Unplug className="h-3.5 w-3.5" /> Disconnect
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Rail pulls sales, tips, items sold, hourly and per-server sales, and hours from Clover once a night, and
                again when you open the app after a while. <strong>Sync now</strong> pulls the last 3 nights right away.{' '}
                <strong>Import item catalog</strong> adds your Clover items and prices; stock moves with sales, not with the catalog.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Toast section ───────────────────────────────────────────────────── */}
      {canManage && (provider === 'toast' || !isConnected) && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Flame className="h-4 w-4 text-orange-700 dark:text-orange-300" />
            <h3 className="text-sm font-semibold">Toast</h3>
            <span className="text-xs text-muted-foreground">Toast API credentials</span>
          </div>

          {!isToastConnected ? (
            role === 'owner' ? (
              <ToastConnectForm reconnect={provider === 'toast' && !!posConfig.needs_reauth} onConnected={() => setProvider('toast')} />
            ) : (
              <p className="text-xs text-muted-foreground">Only the owner can connect Toast.</p>
            )
          ) : (
            <div className="space-y-3">
              {typeof posConfig.toast_restaurant_name === 'string' && (
                <p className="text-xs text-muted-foreground">Connected to <strong>{posConfig.toast_restaurant_name}</strong>.</p>
              )}
              <PullStatus provider="toast" posConfig={posConfig} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleToastSyncSales} disabled={busy} className="min-h-11 gap-2 sm:min-h-0">
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingSales ? 'animate-spin' : ''}`} />
                  {syncingSales ? 'Syncing…' : 'Sync now'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleToastSyncInv} disabled={busy} className="min-h-11 gap-2 sm:min-h-0">
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingInv ? 'animate-spin' : ''}`} />
                  {syncingInv ? 'Syncing…' : 'Sync Menu / Inventory'}
                </Button>
                {role === 'owner' && (
                  <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={disconnecting} className="min-h-11 gap-2 text-muted-foreground sm:min-h-0">
                    <Unplug className="h-3.5 w-3.5" /> Disconnect
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Rail pulls totals, tips, items sold, hourly and per-server sales, and employee hours into the Dashboard,
                Books and Payroll once a night, and again when you open the app after a while.{' '}
                <strong>Sync now</strong> pulls the last 3 nights right away. <strong>Sync Menu / Inventory</strong> imports your Toast menu items as inventory. Stock itself moves with sales,
                not with the menu.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── 2TouchPOS ────────────────────────────────────────────────────────── */}
      {canManage && (provider === '2touch' || !isConnected) && (
        <TwoTouchPanel
          posConfig={posConfig}
          isConnected={provider === '2touch'}
          onConnected={() => setProvider('2touch')}
          onDisconnect={() => { handleDisconnect(); }}
          role={role}
        />
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {POS_META[provider as keyof typeof POS_META]?.name ?? 'your POS'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Rail stops syncing and deletes the saved login. Sales, hours and stock already recorded stay as they are.
              You can connect again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Keep connected</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDisconnect} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
