import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Loss Tracking' };

export default function InventoryLossPage() {
  redirect('/app/inventory');
}
