'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Leaf, Flame, Monitor, CheckCircle, AlertTriangle, RefreshCw, Unplug, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { syncCloverInventory, disconnectPOS } from '../actions';
import type { Role } from '@/lib/permissions';

const POS_META = {
  clover:  { name: 'Clover',     icon: Leaf,    color: 'text-green-400',  badge: 'bg-green-400/15 text-green-400 border-green-400/30' },
  toast:   { name: 'Toast',      icon: Flame,   color: 'text-orange-400', badge: 'bg-orange-400/15 text-orange-400 border-orange-400/30' },
  '2touch':{ name: '2TouchPOS',  icon: Monitor, color: 'text-blue-400',   badge: 'bg-blue-400/15 text-blue-400 border-blue-400/30' },
} as const;

interface Props {
  orgId: string;
  role: Role;
  posProvider: 'clover' | 'toast' | '2touch' | null;
  posConfig: Record<string, unknown>;
  cloverAuthUrl: string | null;
  flashConnected: boolean;
  flashError?: string;
}

export function POSPanel({ role, posProvider, posConfig, cloverAuthUrl, flashConnected, flashError }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const canManage = role === 'owner' || role === 'manager';
  const isCloverConnected = posProvider === 'clover' && !!(posConfig as { access_token?: string }).access_token;

  useEffect(() => {
    if (flashConnected) toast.success('Clover connected successfully!');
    if (flashError) {
      const messages: Record<string, string> = {
        clover_missing_params: 'OAuth response was incomplete — try again',
        clover_unauthorized: 'You do not have permission to connect a POS',
        clover_token_failed: 'Clover rejected the authorization — try again',
        clover_invalid_token: 'Clover returned an invalid token',
        clover_save_failed: 'Connected but failed to save — contact support',
      };
      toast.error(messages[flashError] ?? 'An error occurred connecting Clover');
    }
  }, [flashConnected, flashError]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await syncCloverInventory();
      toast.success(`Synced — ${res.created} created, ${res.updated} updated${res.skipped ? `, ${res.skipped} skipped` : ''}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect POS? This will clear the stored access token.')) return;
    setDisconnecting(true);
    try {
      await disconnectPOS();
      toast.success('POS disconnected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b">
        <h2 className="text-sm font-semibold">POS Integration</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Connect your point-of-sale system to sync inventory and sales data
        </p>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Current POS status */}
        {posProvider ? (
          <div className="flex items-center gap-4">
            {(() => {
              const meta = POS_META[posProvider];
              const Icon = meta.icon;
              return (
                <>
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${meta.badge}`}>
                    <Icon className={`h-5 w-5 ${meta.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{meta.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      {isCloverConnected ? (
                        <><CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Connected</>
                      ) : (
                        <><AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Selected — not yet connected</>
                      )}
                    </p>
                  </div>
                  {isCloverConnected && (
                    <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 bg-emerald-400/10">
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
            <p className="text-sm">No POS connected. Connect one below to enable sync.</p>
          </div>
        )}

        {/* Clover actions */}
        {(posProvider === 'clover' || posProvider === null) && canManage && (
          <div className="space-y-3">
            {!isCloverConnected && (
              <div className="rounded-lg border border-dashed border-white/15 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Leaf className="h-4 w-4 text-green-400" />
                  <p className="text-sm font-medium">Connect Clover</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Authorize Rail to read your Clover inventory, items, and merchant info.
                  You'll be redirected to Clover to approve access.
                </p>
                {cloverAuthUrl ? (
                  <a href={cloverAuthUrl}>
                    <Button size="sm" className="gap-2 bg-green-500 hover:bg-green-600 text-white">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Connect Clover
                    </Button>
                  </a>
                ) : (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    CLOVER_CLIENT_ID and CLOVER_REDIRECT_URI must be set in .env.local
                  </p>
                )}
              </div>
            )}

            {isCloverConnected && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleSync} disabled={syncing} className="gap-2">
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing…' : 'Sync Inventory from Clover'}
                </Button>
                {role === 'owner' && (
                  <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={disconnecting} className="gap-2 text-muted-foreground">
                    <Unplug className="h-3.5 w-3.5" />
                    Disconnect
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Toast / 2Touch — coming soon */}
        {(posProvider === 'toast' || posProvider === '2touch') && (
          <div className="rounded-lg border border-dashed border-white/10 p-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{POS_META[posProvider].name}</span> integration is coming soon.
              {' '}For now you can import data manually via the Payroll → Import tab.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
