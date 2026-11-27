'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { connectToast } from '../actions';

/**
 * What the owner has to get from Toast before this can work. Shown beside the
 * form on both the setup page and in Settings, because "Toast does not give you
 * this by default" is the thing most likely to stop a bar.
 */
export function ToastRequirements() {
  return (
    <div className="rounded-md bg-muted/50 border p-3 space-y-2 text-xs text-muted-foreground">
      <p className="font-semibold text-foreground">What you need from Toast first</p>
      <ul className="list-disc list-inside space-y-1 leading-relaxed">
        <li>
          <strong>Toast API access for this restaurant.</strong> Toast sells and approves it separately from the POS, and
          Rail cannot switch it on. Ask your Toast account manager or Toast support for read-only API credentials.
          Price and availability are Toast&apos;s to say.
        </li>
        <li>
          A <strong>client ID</strong> and <strong>client secret</strong>, issued for this location, that can read
          <strong> orders</strong>, <strong>labor</strong> (employees and time entries), <strong>menus</strong> and
          <strong> restaurant details</strong>. Without labor Rail still syncs sales, but not hours or declared cash tips.
          Without menus items have no category.
        </li>
        <li>The <strong>restaurant GUID</strong> for the location (Toast also calls it the restaurant external ID).</li>
      </ul>
      <p className="leading-relaxed">
        Rail only reads from Toast and never changes anything in it. The secret is encrypted before it is stored and is
        never shown again. Sales refresh once a night and when you press Sync, not every few minutes.
      </p>
      <p className="leading-relaxed rounded border border-amber-500/30 bg-amber-500/10 p-2 text-amber-800 dark:text-amber-300">
        This connection has not yet been tested against a live Toast restaurant. After the first sync, compare three
        printed Z reports with Rail&apos;s totals before relying on them.
      </p>
    </div>
  );
}

export function ToastConnectForm({ onConnected, reconnect = false }: { onConnected: () => void; reconnect?: boolean }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [restaurantGuid, setRestaurantGuid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const r = await connectToast({ client_id: clientId, client_secret: clientSecret, restaurant_guid: restaurantGuid });
      if (!r.ok) { setError(r.error); return; }
      // The secret leaves the page the moment Toast accepts it.
      setClientId(''); setClientSecret(''); setRestaurantGuid('');
      toast.success(`Toast connected to ${r.restaurant}`);
      onConnected();
    } catch {
      setError('Something went wrong reaching Rail. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <ToastRequirements />
      {reconnect && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Toast no longer accepts the saved login. Enter the credentials again to resume syncing.
        </p>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => { e.preventDefault(); void handleConnect(); }}
      >
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="toast-client-id">Client ID</Label>
          <Input id="toast-client-id" value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="h-11 text-sm font-mono" autoComplete="off" spellCheck={false} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="toast-client-secret">Client secret</Label>
          <Input id="toast-client-secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
            className="h-11 text-sm font-mono" autoComplete="new-password" spellCheck={false} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="toast-guid">Restaurant GUID</Label>
          <Input id="toast-guid" value={restaurantGuid} onChange={(e) => setRestaurantGuid(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="h-11 text-sm font-mono" autoComplete="off" spellCheck={false} />
        </div>
        {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <Button type="submit" disabled={loading || !clientId || !clientSecret || !restaurantGuid} className="h-11 gap-2 bg-orange-700 hover:bg-orange-800 text-white">
          {loading
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking with Toast…</>
            : <>{reconnect ? <KeyRound className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />} {reconnect ? 'Reconnect Toast' : 'Connect Toast'}</>}
        </Button>
      </form>
    </div>
  );
}
