'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, clientIp, RATE_LIMITS, type RateLimitRule } from '@/lib/rate-limit';
import { checkPassword } from '@/lib/auth/password';
import { signupAnswer, type SignupAnswer } from '@/lib/auth/signup-result';
import { SIGNUP_OPEN } from '@/lib/auth/signup-open';
import { isBotRequest } from '@/lib/auth/bot-check';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function limited(rule: RateLimitRule, prefix: string, email: string) {
  const ip = clientIp(await headers());
  const [a, b] = await Promise.all([
    checkRateLimit(rule, `${prefix}-ip:${ip}`),
    checkRateLimit(rule, `${prefix}-acct:${email}`),
  ]);
  return a.allowed && b.allowed
    ? null
    : Math.max(a.retryAfterSeconds, b.retryAfterSeconds);
}

export async function signUpOwner(
  email: string,
  password: string,
  honeypot: string,
): Promise<SignupAnswer> {
  if (!SIGNUP_OPEN) return signupAnswer('closed');
  // A filled hidden field is a script: same screen as a real sign-up, no account.
  if (honeypot) return signupAnswer('honeypot');
  // Same words as a real throttle, so a bot learns nothing about why.
  if (await isBotRequest()) return signupAnswer('throttled', { retryAfterSeconds: 60 });

  const addr = String(email ?? '').trim().toLowerCase();
  if (!EMAIL.test(addr) || addr.length > 254) return signupAnswer('invalid_email');
  const pw = checkPassword(password, addr);
  if (!pw.ok) return signupAnswer('weak_password', { weakReason: pw.reason });

  const retry = await limited(RATE_LIMITS.signup, 'signup', addr);
  if (retry !== null) return signupAnswer('throttled', { retryAfterSeconds: retry });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email: addr, password });
  if (error) {
    console.warn('[auth] signup failed:', error.message);
    return signupAnswer('provider_error');
  }
  // Supabase returns an obfuscated user with no identities for a confirmed address.
  const existing = (data.user?.identities?.length ?? 1) === 0;
  return signupAnswer(existing ? 'already_registered' : 'created');
}

export async function resendSignup(email: string): Promise<SignupAnswer> {
  if (!SIGNUP_OPEN) return signupAnswer('closed');
  const addr = String(email ?? '').trim().toLowerCase();
  if (!EMAIL.test(addr)) return signupAnswer('invalid_email');
  const retry = await limited(RATE_LIMITS.signupResend, 'resend', addr);
  if (retry !== null) return signupAnswer('throttled', { retryAfterSeconds: retry });

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: 'signup', email: addr });
  if (error) console.warn('[auth] resend failed:', error.message);
  return signupAnswer('created');
}
