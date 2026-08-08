'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Leaf, Flame, Monitor, CheckCircle, AlertTriangle,
  RefreshCw, Unplug, ExternalLink, Loader2, KeyRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  syncCloverInventory, syncCloverSales,
  connectToast, syncToastSales, syncToastInventory, syncToastShifts,
  save2TouchConfig, triggerTwoTouchPoll, get2TouchAgentConfig, type TwoTouchAgentConfig,
  disconnectPOS,
} from '../actions';
import type { Role } from '@/lib/permissions';

const POS_META = {
  clover:  { name: 'Clover',    icon: Leaf,    color: 'text-green-400',  badge: 'bg-green-400/15 text-green-400 border-green-400/30' },
  toast:   { name: 'Toast',     icon: Flame,   color: 'text-orange-400', badge: 'bg-orange-400/15 text-orange-400 border-orange-400/30' },
  '2touch':{ name: '2TouchPOS', icon: Monitor, color: 'text-blue-400',   badge: 'bg-blue-400/15 text-blue-400 border-blue-400/30' },
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

// ── Toast credentials form ────────────────────────────────────────────────────

function ToastConnectForm({ onConnected }: { onConnected: () => void }) {
  const [clientId,       setClientId]       = useState('');
  const [clientSecret,   setClientSecret]   = useState('');
  const [restaurantGuid, setRestaurantGuid] = useState('');
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    if (!clientId || !clientSecret || !restaurantGuid) {
      toast.error('All three fields are required');
      return;
    }
    setLoading(true);
    try {
      await connectToast({ client_id: clientId, client_secret: clientSecret, restaurant_guid: restaurantGuid });
      toast.success('Toast connected successfully!');
      onConnected();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connection failed — check your credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-orange-500/30 bg-orange-500/5 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-orange-400" />
        <p className="text-sm font-medium">Connect Toast</p>
      </div>
      {/* Step-by-step instructions */}
      <div className="rounded-md bg-muted/50 border p-3 space-y-1.5 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">How to get your credentials:</p>
        <ol className="list-decimal list-inside space-y-1 leading-relaxed">
          <li>Log in to <strong>Toast Web</strong> at <span className="font-mono">pos.toasttab.com</span></li>
          <li>Go to <strong>Integrations → Toast API access → Manage credentials</strong></li>
          <li>Click <strong>Create new credentials → Standard API</strong></li>
          <li>Enter a name (e.g. &quot;Rail&quot;), select scopes: <em>Orders, Labor, Menu</em>, choose your location</li>
          <li>Copy the <strong>Client ID</strong>, <strong>Client Secret</strong>, and <strong>Restaurant GUID</strong> shown below</li>
        </ol>
        <p className="text-[10px] pt-1">
          ⚠ Requires Toast Restaurant Management Suite Essentials or higher.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Client ID</Label>
          <Input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="h-8 text-sm font-mono"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Client Secret</Label>
          <Input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Paste your Toast client secret"
            className="h-8 text-sm font-mono"
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Restaurant GUID</Label>
          <Input
            value={restaurantGuid}
            onChange={(e) => setRestaurantGuid(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="h-8 text-sm font-mono"
            autoComplete="off"
          />
          <p className="text-[11px] text-muted-foreground">
            Shown on the credentials page — also called &quot;Toast-Restaurant-External-ID&quot;
          </p>
        </div>
      </div>
      <Button
        size="sm"
        disabled={loading}
        onClick={handleConnect}
        className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
      >
        {loading
          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting…</>
          : <><CheckCircle className="h-3.5 w-3.5" /> Connect Toast</>
        }
      </Button>
    </div>
  );
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
      toast.success('2TouchPOS configured — copy the pairing code below for the installer');
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
        toast.success(`Processed ${res.processed} email${res.processed > 1 ? 's' : ''} — ${res.zReports} Z reports, ${res.empReports} shift reports`);
      } else {
        toast.info('No new 2Touch emails found in inbox');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Poll failed');
    } finally { setPolling(false); }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Monitor className="h-4 w-4 text-blue-400" />
        <h3 className="text-sm font-semibold">2TouchPOS</h3>
        <span className="text-xs text-muted-foreground">Email-based · auto-sync every 15 min</span>
        {isConnected && (
          <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 ml-auto">Active</Badge>
        )}
      </div>

      {/* How it works */}
      <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-3 space-y-1.5 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">How 2Touch integration works:</p>
        <ol className="list-decimal list-inside space-y-1 leading-relaxed">
          <li>In 2Touch Cloud, configure nightly Z reports to email to{' '}
            <span className="font-mono font-semibold text-primary">{process.env.NEXT_PUBLIC_GMAIL_USER ?? 'your configured Gmail'}</span>
          </li>
          <li>Rail checks that inbox every <strong>15 minutes</strong> via Vercel Cron</li>
          <li>New report emails are parsed by AI and inserted into your Dashboard &amp; Payroll automatically</li>
          <li>Each email is processed exactly once — duplicates are skipped</li>
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
            className="h-8 text-sm"
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
              Pairing code — the agent installer asks for this
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
            On the POS server, double-click <span className="font-mono">rail-2touch-agent.exe</span> and paste this
            when it asks. The code carries this bar&apos;s unique token — never share it with another bar.
          </p>
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

// ── Main panel ────────────────────────────────────────────────────────────────

export function POSPanel({ role, posProvider, posConfig, cloverAuthUrl, flashConnected, flashError }: Props) {
  const [provider,      setProvider]      = useState(posProvider);
  const [syncingInv,    setSyncingInv]    = useState(false);
  const [syncingSales,  setSyncingSales]  = useState(false);
  const [syncingShifts, setSyncingShifts] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const canManage         = role === 'owner' || role === 'manager';
  const isCloverConnected = provider === 'clover' && !!(posConfig.access_token);
  const isToastConnected  = provider === 'toast'  && !!(posConfig.client_id);
  const isConnected       = isCloverConnected || isToastConnected;

  useEffect(() => {
    if (flashConnected) toast.success('Clover connected successfully!');
    if (flashError) {
      const messages: Record<string, string> = {
        clover_missing_params:  'OAuth response was incomplete — try again',
        clover_unauthorized:    'You do not have permission to connect a POS',
        clover_token_failed:    'Clover rejected the authorization — try again',
        clover_invalid_token:   'Clover returned an invalid token',
        clover_save_failed:     'Connected but failed to save — contact support',
      };
      toast.error(messages[flashError] ?? `Connection error: ${flashError}`);
    }
  }, [flashConnected, flashError]);

  // ── Clover handlers ─────────────────────────────────────────────────────────

  async function handleCloverSyncInv() {
    setSyncingInv(true);
    try {
      const res = await syncCloverInventory();
      toast.success(`Inventory synced — ${res.created} created, ${res.updated} updated${res.skipped ? `, ${res.skipped} skipped` : ''}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Sync failed'); }
    finally { setSyncingInv(false); }
  }

  async function handleCloverSyncSales() {
    setSyncingSales(true);
    try {
      const res = await syncCloverSales(7);
      toast.success(`Sales synced — ${res.upserted} day${res.upserted !== 1 ? 's' : ''} updated`);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Sync failed'); }
    finally { setSyncingSales(false); }
  }

  // ── Toast handlers ──────────────────────────────────────────────────────────

  async function handleToastSyncSales() {
    setSyncingSales(true);
    try {
      const res = await syncToastSales(7);
      toast.success(`Sales synced — ${res.upserted} day${res.upserted !== 1 ? 's' : ''} updated`);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Sync failed'); }
    finally { setSyncingSales(false); }
  }

  async function handleToastSyncInv() {
    setSyncingInv(true);
    try {
      const res = await syncToastInventory();
      toast.success(`Menu synced — ${res.created} created, ${res.updated} updated${res.skipped ? `, ${res.skipped} skipped` : ''}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Sync failed'); }
    finally { setSyncingInv(false); }
  }

  async function handleToastSyncShifts() {
    setSyncingShifts(true);
    try {
      const res = await syncToastShifts(7);
      toast.success(`Shifts synced — ${res.upserted} shift records, ${res.newEmployees} new employees`);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Sync failed'); }
    finally { setSyncingShifts(false); }
  }

  // ── Disconnect ──────────────────────────────────────────────────────────────

  async function handleDisconnect() {
    if (!confirm(`Disconnect ${POS_META[provider as keyof typeof POS_META]?.name ?? 'POS'}? This clears the stored credentials.`)) return;
    setDisconnecting(true);
    try {
      await disconnectPOS();
      setProvider(null);
      toast.success('POS disconnected');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to disconnect'); }
    finally { setDisconnecting(false); }
  }

  const busy = syncingInv || syncingSales || syncingShifts;

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
                        <><AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Selected — authorization required</>
                      )}
                    </p>
                  </div>
                  {isConnected && (
                    <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
                      Active
                    </Badge>
                  )}
                </>
              );
            })()}
          </div>
        ) : (
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <p className="text-sm">No POS connected. Choose a provider below.</p>
          </div>
        )}
      </div>

      {/* ── Clover section ──────────────────────────────────────────────────── */}
      {canManage && (provider === 'clover' || !isConnected) && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Leaf className="h-4 w-4 text-green-400" />
            <h3 className="text-sm font-semibold">Clover</h3>
            <span className="text-xs text-muted-foreground">OAuth 2.0 — secure redirect</span>
          </div>

          {!isCloverConnected ? (
            cloverAuthUrl ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  You&apos;ll be redirected to Clover to approve access. Rail never stores your Clover password.
                </p>
                <a href={cloverAuthUrl}>
                  <Button size="sm" className="gap-2 bg-green-500 hover:bg-green-600 text-white">
                    <ExternalLink className="h-3.5 w-3.5" /> Authorize with Clover
                  </Button>
                </a>
              </div>
            ) : (
              <p className="text-xs text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                CLOVER_CLIENT_ID and CLOVER_REDIRECT_URI must be set in .env.local
              </p>
            )
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleCloverSyncInv} disabled={busy} className="gap-2">
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingInv ? 'animate-spin' : ''}`} />
                  {syncingInv ? 'Syncing…' : 'Sync Inventory'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleCloverSyncSales} disabled={busy} className="gap-2">
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingSales ? 'animate-spin' : ''}`} />
                  {syncingSales ? 'Syncing…' : 'Sync Sales (7 days)'}
                </Button>
                {role === 'owner' && (
                  <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={disconnecting} className="gap-2 text-muted-foreground">
                    <Unplug className="h-3.5 w-3.5" /> Disconnect
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Sync Inventory</strong> imports your Clover item catalog.{' '}
                <strong>Sync Sales</strong> pulls the last 7 nights of orders into the Dashboard &amp; Books.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Toast section ───────────────────────────────────────────────────── */}
      {canManage && (provider === 'toast' || !isConnected) && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400" />
            <h3 className="text-sm font-semibold">Toast</h3>
            <span className="text-xs text-muted-foreground">API key credentials</span>
          </div>

          {!isToastConnected ? (
            <ToastConnectForm onConnected={() => setProvider('toast')} />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleToastSyncSales} disabled={busy} className="gap-2">
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingSales ? 'animate-spin' : ''}`} />
                  {syncingSales ? 'Syncing…' : 'Sync Sales (7 days)'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleToastSyncInv} disabled={busy} className="gap-2">
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingInv ? 'animate-spin' : ''}`} />
                  {syncingInv ? 'Syncing…' : 'Sync Menu / Inventory'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleToastSyncShifts} disabled={busy} className="gap-2">
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingShifts ? 'animate-spin' : ''}`} />
                  {syncingShifts ? 'Syncing…' : 'Sync Shifts (7 days)'}
                </Button>
                {role === 'owner' && (
                  <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={disconnecting} className="gap-2 text-muted-foreground">
                    <Unplug className="h-3.5 w-3.5" /> Disconnect
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Sync Sales</strong> pulls nightly order totals + tips into the Dashboard &amp; Books.{' '}
                <strong>Sync Menu</strong> imports your Toast menu items as inventory.{' '}
                <strong>Sync Shifts</strong> imports employee time entries into Payroll.
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
    </div>
  );
}
