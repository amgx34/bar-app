'use server';

import { redirect } from 'next/navigation';
import { getCurrentOrg } from '@/lib/org';
import { recordTermsAcceptance } from '@/lib/terms';

/**
 * Records acceptance and returns the user to where they were headed.
 *
 * `next` is validated rather than trusted: it arrives as a query parameter, and
 * redirecting to an arbitrary value would turn the consent screen into an open
 * redirect — a phishing primitive on a page users are told to trust.
 */
export async function acceptTerms(next: string) {
  // Establishes the session and resolves the active bar for the record.
  const { org } = await getCurrentOrg();

  await recordTermsAcceptance(org.id);

  const safeNext =
    next.startsWith('/') && !next.startsWith('//') ? next : '/app/dashboard';

  redirect(safeNext);
}
