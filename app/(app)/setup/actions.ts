'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export type SetupInput = {
  name: string;
  tip_split_percent: number;
  default_hourly_rate: number;
};

export async function createOrgWithSettings(data: SetupInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const admin = createAdminClient();

  const slug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) + '-' + Math.random().toString(36).slice(2, 7);

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name: data.name.trim(),
      slug,
      pos_provider: null,
      bar_settings: {
        tip_split_percent: data.tip_split_percent,
        default_hourly_rate: data.default_hourly_rate,
      },
    })
    .select()
    .single();

  if (orgErr) throw new Error(orgErr.message);

  const { error: memberErr } = await admin
    .from('memberships')
    .insert({ user_id: user.id, organization_id: org.id, role: 'owner' });

  if (memberErr) throw new Error(memberErr.message);

  revalidatePath('/app');
  return org;
}
