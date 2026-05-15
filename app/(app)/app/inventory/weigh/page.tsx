import { Scale } from 'lucide-react';
import { InventoryNav } from '../_components/inventory-nav';
import { getWeighReports, getInventoryItemsForWeigh } from './actions';
import { WeighManager } from './_components/weigh-manager';

export const dynamic = 'force-dynamic';

export default async function WeighPage() {
  const [reports, inventoryItems] = await Promise.all([
    getWeighReports(),
    getInventoryItemsForWeigh(),
  ]);

  return (
    <main className="p-6 space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Inventory</p>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Scale className="h-6 w-6 text-primary" />
          Weigh Reports
        </h1>
      </div>

      <InventoryNav />

      <p className="text-sm text-muted-foreground max-w-xl">
        Track bottle levels at the start and end of each shift to measure actual
        consumption, estimate cost of goods, and identify pour discrepancies.
      </p>

      <WeighManager initialReports={reports} inventoryItems={inventoryItems} />
    </main>
  );
}
