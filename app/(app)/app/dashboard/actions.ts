'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg, type BarSettings } from '@/lib/org';
import { applyOnboardingDismissed } from '@/lib/onboarding/dismiss';

// Display preference only: hides the cash-tips banner for one night on this
// browser. Touches no figure; the Tonight chip stays as the quiet reminder.
export async function dismissCashTipsBanner(formData: FormData) {
  const night = String(formData.get('night') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return;
  (await cookies()).set('rail_cash_banner_off', night, {
    maxAge: 60 * 60 * 24 * 3, path: '/app', sameSite: 'lax', httpOnly: true,
  });
  revalidatePath('/app/dashboard');
}

// Hides the setup checklist for the whole bar. Reads the latest bar_settings
// and spreads it (see lib/onboarding/dismiss.ts), then scopes the write to the org.
export async function dismissOnboarding() {
  const { org, role } = await getCurrentOrg();
  if (role !== 'owner' && role !== 'manager') return;
  const admin = createAdminClient();
  const { data } = await admin
    .from('organizations').select('bar_settings').eq('id', org.id).single();
  const next = applyOnboardingDismissed((data?.bar_settings ?? {}) as BarSettings, new Date().toISOString());
  const { error } = await admin
    .from('organizations').update({ bar_settings: next }).eq('id', org.id);
  if (error) throw new Error(error.message);
  revalidatePath('/app/dashboard');
}
