'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';
import { canManagePayroll } from '@/lib/permissions';

/**
 * The bar's staff join code.
 *
 * NULL means staff sign-up is off, which is what every existing bar gets. The
 * code is not a credential — it gets a claim into a queue a manager must
 * approve — but it is still rotatable, because a code written on a whiteboard
 * outlives the people who read it.
 *
 * Gated on canManagePayroll: the same people who already correct hours and move
 * tips, and the same people who approve the claims this code produces.
 */

/** Unambiguous alphabet: no O/0, no I/1/l. This gets read aloud across a bar. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(len = 8): string {
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Generates a fresh code, or replaces the existing one. Returns the new code. */
export async function rotateStaffJoinCode(): Promise<string> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not permitted');

  const supabase = createAdminClient();

  // The column carries a unique index, so a collision is a failed write rather
  // than two bars quietly sharing a code. Retry a few times before giving up.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { error } = await supabase
      .from('organizations')
      .update({ staff_join_code: code })
      .eq('id', org.id);

    if (!error) {
      revalidatePath('/app/settings');
      return code;
    }
  }

  throw new Error('Could not generate a unique code. Please try again.');
}

/**
 * Turns staff sign-up off.
 *
 * Existing accounts are untouched — this closes the door to new claims, it does
 * not evict the people already through it. Revoking an individual is a separate
 * action on the employees screen.
 */
export async function disableStaffJoinCode(): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not permitted');

  const supabase = createAdminClient();
  await supabase
    .from('organizations')
    .update({ staff_join_code: null })
    .eq('id', org.id);

  revalidatePath('/app/settings');
}
