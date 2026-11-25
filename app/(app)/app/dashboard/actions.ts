'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

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
