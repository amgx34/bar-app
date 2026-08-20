import type { Metadata } from 'next';
import { ClipboardCheck } from 'lucide-react';
import { getSetupGaps } from './actions';
import { SetupGapsPanel } from './_components/setup-gaps-panel';
import { listBundles, listInventoryOptions } from '../../settings/bundle-actions';
import { BundlesPanel } from '../../settings/_components/bundles-panel';
import { getCurrentOrg } from '@/lib/org';
import { canEditInventory } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Stock Tracking Setup' };

/**
 * Whether inventory can account for what the POS sells.
 *
 * Its own screen rather than a card on Analytics: Analytics answers "how is the
 * bar trading", and this answers "can those numbers be trusted at all". Mixing
 * a configuration checklist into a numbers report made it easy to scroll past
 * the one thing that invalidates everything above it.
 */
export default async function InventorySetupPage() {
  // The report and the tool that resolves it, loaded together. Recipes used to
  // live under Settings -> POS Integration, three guesses away from the item
  // form where the question actually arises.
  const [data, bundles, inventoryOptions, { role }] = await Promise.all([
    getSetupGaps(),
    listBundles(),
    listInventoryOptions(),
    getCurrentOrg(),
  ]);

  return (
    <main className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <p className="text-sm text-muted-foreground">Inventory</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ClipboardCheck className="h-6 w-6 text-primary" aria-hidden />
          Stock Tracking Setup
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every drink sold in the last {data.windowDays} days, and whether inventory
          can actually account for it. Anything listed here is depleting the wrong
          stock, or none at all.
        </p>
      </div>

      <SetupGapsPanel gaps={data.gaps} summary={data.summary} />

      {/* Directly below the report, because "18 items need a recipe" and "here
          is where you write one" belong on the same screen. */}
      <BundlesPanel
        bundles={bundles}
        options={inventoryOptions}
        canEdit={canEditInventory(role)}
      />
    </main>
  );
}
