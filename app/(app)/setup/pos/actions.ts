'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';
import { revalidatePath } from 'next/cache';

export async function selectPOSProvider(provider: '2touch' | 'clover' | 'toast') {
  const { org } = await getCurrentOrg();
  const admin = createAdminClient();

  const { error } = await admin
    .from('organizations')
    .update({ pos_provider: provider })
    .eq('id', org.id);

  if (error) throw new Error(error.message);
  revalidatePath('/app');
}
