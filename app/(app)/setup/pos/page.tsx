import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentOrg } from '@/lib/org';
import POSSelector from './_components/pos-selector';

export const metadata: Metadata = { title: 'Choose your POS' };

export default async function POSSetupPage() {
  const { org } = await getCurrentOrg();

  // Already chose a POS — skip this step
  if (org.pos_provider) redirect('/app/dashboard');

  return <POSSelector orgId={org.id} />;
}
