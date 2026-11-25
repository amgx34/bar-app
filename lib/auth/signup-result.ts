export type SignupOutcome =
  | 'created' | 'already_registered' | 'honeypot' | 'provider_error'
  | 'closed' | 'throttled' | 'invalid_email' | 'weak_password';

export type SignupAnswer = { ok: true } | { ok: false; message: string };

/**
 * One body for every outcome that depends on the address (new, existing,
 * honeypot, provider failure), so the action cannot be used to probe who has an
 * account. Only refusals that say nothing about the address get words.
 */
export function signupAnswer(
  outcome: SignupOutcome,
  ctx: { retryAfterSeconds?: number; weakReason?: string } = {},
): SignupAnswer {
  switch (outcome) {
    case 'closed':
      return { ok: false, message: 'Rail is invite only right now. Request access and we will set you up.' };
    case 'throttled': {
      const m = Math.max(1, Math.ceil((ctx.retryAfterSeconds ?? 0) / 60));
      return { ok: false, message: `Too many attempts. Try again in ${m} minute${m === 1 ? '' : 's'}.` };
    }
    case 'invalid_email':
      return { ok: false, message: 'Enter a valid email address.' };
    case 'weak_password':
      return { ok: false, message: ctx.weakReason ?? 'Choose a stronger password.' };
    default:
      return { ok: true };
  }
}
