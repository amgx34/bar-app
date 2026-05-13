import { redirect } from 'next/navigation';
import { getCurrentOrg } from '@/lib/org';
import POSSelector from './_components/pos-selector';

export default async function POSSetupPage() {
  const { org } = await getCurrentOrg();

  // Already chose a POS — skip this step
  if (org.pos_provider) redirect('/app/dashboard');

  return <POSSelector orgId={org.id} />;
}
