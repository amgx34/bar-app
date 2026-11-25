import { describe, it, expect } from 'vitest';
import { signupAnswer, type SignupOutcome } from './signup-result';

describe('signupAnswer', () => {
  // The same body for every outcome that depends on the address, so the
  // endpoint cannot be used to find out who already has an account.
  const addressDependent: SignupOutcome[] = [
    'created', 'already_registered', 'honeypot', 'provider_error',
  ];
  it('gives one identical answer for every address-dependent outcome', () => {
    const answers = addressDependent.map((o) => JSON.stringify(signupAnswer(o)));
    expect(new Set(answers).size).toBe(1);
    expect(signupAnswer('created')).toEqual({ ok: true });
  });
  it('refuses plainly when sign-up is closed, throttled, or the input is bad', () => {
    for (const o of ['closed', 'throttled', 'invalid_email', 'weak_password'] as const) {
      const a = signupAnswer(o, { retryAfterSeconds: 120, weakReason: 'Use at least 10 characters.' });
      expect(a.ok).toBe(false);
      if (!a.ok) expect(a.message.length).toBeGreaterThan(0);
    }
  });
  it('throttle message names minutes, never below one', () => {
    const a = signupAnswer('throttled', { retryAfterSeconds: 5 });
    expect(a).toEqual({ ok: false, message: 'Too many attempts. Try again in 1 minute.' });
  });
});
