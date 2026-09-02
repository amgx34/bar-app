'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { voidShipment } from '../../shipment-actions';
import type { ShipmentSummary } from '../../shipment-actions';

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The confirmation for voiding a posted shipment.
 *
 * Void + re-enter is the ONLY way the product lets anyone correct a shipment
 * once it is posted, and entry is AI-parsed — a mistyped invoice is expected,
 * not exceptional. Voiding is also destructive in a way most confirmations on
 * this screen are not: it reverses the stock the shipment added AND removes
 * its money from the P&L (see voidShipment in ../../shipment-actions.ts), so
 * this uses a real confirm dialog rather than window.confirm and states both
 * effects in plain language, naming the vendor and the total so a manager
 * looking at a list of similar invoices cannot void the wrong row by mistake.
 */
export function VoidShipmentDialog({
  shipment,
  onClose,
}: {
  /** null closes the dialog; a summary opens it for that shipment. */
  shipment: ShipmentSummary | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    if (!shipment) return;
    startTransition(async () => {
      try {
        await voidShipment(shipment.id);
        toast.success('Shipment voided');
        onClose();
        // voidShipment already revalidates the server paths it touches, but
        // this dialog lives in a client component holding its own copy of
        // `shipment` from props — router.refresh() is what makes the row on
        // screen actually flip to "Voided" without a full reload.
        router.refresh();
      } catch (err) {
        // voidShipment throws a distinct, human-readable message when the
        // shipment is already fully voided (a double-clicked Void, or a
        // second tab) — surfaced as-is rather than a generic failure toast.
        toast.error(err instanceof Error ? err.message : 'Could not void that shipment');
      }
    });
  }

  return (
    <AlertDialog open={shipment !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void this shipment?</AlertDialogTitle>
          <AlertDialogDescription>
            {shipment && (
              <>
                This reverses the stock {shipment.vendorName}
                {shipment.invoiceNumber ? `'s invoice #${shipment.invoiceNumber}` : "'s invoice"}{' '}
                added, and removes {money(shipment.computedTotal)} from the books. The invoice stays
                on record as voided — to fix a mistake, void it and log the shipment again.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending} variant="destructive">
            {isPending ? 'Voiding…' : 'Void shipment'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
