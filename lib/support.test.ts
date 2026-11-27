import { describe, expect, it } from 'vitest';
import { resolveSupportEmail } from './support';

describe('support address', () => {
  it('uses SUPPORT_EMAIL when set', () => {
    expect(resolveSupportEmail(' help@rail.test ')).toBe('help@rail.test');
  });
  it('falls back to the existing address when unset or blank', () => {
    expect(resolveSupportEmail(undefined)).toBe('railsystemspos@gmail.com');
    expect(resolveSupportEmail('  ')).toBe('railsystemspos@gmail.com');
  });
});
