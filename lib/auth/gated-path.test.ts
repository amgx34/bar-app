import { describe, it, expect } from 'vitest';
import { isGatedPath } from './gated-path';

describe('isGatedPath', () => {
  it.each(['/app', '/app/dashboard', '/me', '/me/pay', '/setup', '/setup/pos', '/setup/pos/clover'])(
    'gates %s', (p) => expect(isGatedPath(p)).toBe(true));

  it.each(['/', '/login', '/apple-icon', '/apple-icon.png', '/setup-guide', '/menu', '/members', '/appointments', '/join', '/auth/confirm'])(
    'leaves %s public', (p) => expect(isGatedPath(p)).toBe(false));
});
