export const PASSWORD_MIN = 10;

export type PasswordCheck = { ok: true } | { ok: false; reason: string };

/** Mirrors the minimum set in Supabase, so the form says it before the server does. */
export function checkPassword(password: string, email: string): PasswordCheck {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return { ok: false, reason: `Use at least ${PASSWORD_MIN} characters.` };
  }
  const pw = password.trim().toLowerCase();
  const addr = (email ?? '').trim().toLowerCase();
  const local = addr.split('@')[0];
  if (addr && (pw === addr || (local.length >= PASSWORD_MIN && pw === local))) {
    return { ok: false, reason: 'Do not use your email address as your password.' };
  }
  return { ok: true };
}
