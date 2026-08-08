import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Analytics' };

export default function AnalyticsRedirectPage() {
  redirect('/app/inventory/analytics');
}
