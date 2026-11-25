import { describe, it, expect } from 'vitest';
import { checkPassword, PASSWORD_MIN } from './password';

describe('checkPassword', () => {
  it('accepts a password of the minimum length', () => {
    expect(checkPassword('x'.repeat(PASSWORD_MIN), 'a@b.com')).toEqual({ ok: true });
  });
  it('rejects one character short', () => {
    const r = checkPassword('x'.repeat(PASSWORD_MIN - 1), 'a@b.com');
    expect(r.ok).toBe(false);
  });
  it('minimum is 10', () => expect(PASSWORD_MIN).toBe(10));
  it('rejects the email address as the password, any case, with spaces', () => {
    expect(checkPassword('Owner@Example.com', ' owner@example.com ').ok).toBe(false);
  });
  it('rejects the part before the @ when long enough', () => {
    expect(checkPassword('ownername12', 'ownername12@example.com').ok).toBe(false);
  });
  it('rejects empty and non-string input', () => {
    expect(checkPassword('', 'a@b.com').ok).toBe(false);
    expect(checkPassword(undefined as unknown as string, 'a@b.com').ok).toBe(false);
  });
});
