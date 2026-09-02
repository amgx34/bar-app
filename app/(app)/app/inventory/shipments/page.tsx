import type { Metadata } from 'next';
import { getCurrentOrg } from '@/lib/org';
import { canEditInventory } from '@/lib/permissions';
import { listShipments } from '../shipment-actions';
import { ShipmentList } from './_components/shipment-list';

export const metadata: Metadata = { title: 'Shipments' };

// Same reasoning as the Items page: this is a log a manager checks after
// every delivery, not a report that tolerates a stale cache. A shipment
// logged a minute ago must show up here without a hard refresh.
export const revalidate = 0;

export default async function ShipmentsPage() {
  const { role } = await getCurrentOrg();
  const shipments = await listShipments();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Shipments</h1>
        <p className="text-muted-foreground">
          Every logged delivery, with what it cost and whether it ties out to the invoice.
        </p>
      </div>

      <ShipmentList shipments={shipments} canEdit={canEditInventory(role)} />
    </div>
  );
}
