'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, clientIp, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Auth runs server-side so it can be bounded and so provider errors never reach
 * the browser verbatim.
 *
 * Signing in from the client meant there was no server hop to rate-limit —
 * password guessing went straight from the browser to Supabase, and whatever
 * message came back was rendered as-is. Provider text is exactly where account
 * enumeration leaks in ("user not found" vs "wrong password").
 */

export type AuthResult = { ok: true } | { ok: false; message: string };

/**
 * One message for every failure mode, so a wrong password and an unknown
 * address are indistinguishable.
 */
const GENERIC_FAILURE = 'That email and password combination is not recognised.';

function throttleMessage(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthResult> {
  const normalisedEmail = email.trim().toLowerCase();
  const ip = clientIp(await headers());

  // Keyed on IP *and* address: an IP limit alone lets one attacker spray many
  // accounts, and an address limit alone lets anyone lock out a known user.
  const [byIp, byAccount] = await Promise.all([
    checkRateLimit(RATE_LIMITS.login, `ip:${ip}`),
    checkRateLimit(RATE_LIMITS.login, `acct:${normalisedEmail}`),
  ]);

  if (!byIp.allowed || !byAccount.allowed) {
    const retry = Math.max(byIp.retryAfterSeconds, byAccount.retryAfterSeconds);
    return { ok: false, message: throttleMessage(retry) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: normalisedEmail,
    password,
  });

  if (error) {
    // Logged server-side, never returned — the operator can still diagnose.
    console.warn('[auth] sign-in failed:', error.message);
    return { ok: false, message: GENERIC_FAILURE };
  }

  return { ok: true };
}

export async function sendMagicLink(
  email: string,
  redirectTo: string,
): Promise<AuthResult> {
  const normalisedEmail = email.trim().toLowerCase();
  const ip = clientIp(await headers());

  const [byIp, byAccount] = await Promise.all([
    checkRateLimit(RATE_LIMITS.login, `magic-ip:${ip}`),
    checkRateLimit(RATE_LIMITS.login, `magic-acct:${normalisedEmail}`),
  ]);

  if (!byIp.allowed || !byAccount.allowed) {
    const retry = Math.max(byIp.retryAfterSeconds, byAccount.retryAfterSeconds);
    return { ok: false, message: throttleMessage(retry) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalisedEmail,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) {
    console.warn('[auth] magic link failed:', error.message);
  }

  // Deliberately identical whether or not the address exists — the response to
  // "email me a link" must not reveal who has an account.
  return { ok: true };
}
