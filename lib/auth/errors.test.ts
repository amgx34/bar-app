import { describe, it, expect } from 'vitest';
import { authErrorCode } from './errors';

describe('authErrorCode', () => {
  it('maps an expired link', () => {
    expect(authErrorCode({ message: 'Email link is invalid or has expired', code: 'otp_expired', status: 403 })).toBe('link_expired');
    expect(authErrorCode({ message: 'Token has expired or is invalid', status: 403 })).toBe('link_expired');
  });
  it('maps a used link', () => {
    expect(authErrorCode({ message: 'One-time token has already been used' })).toBe('link_used');
  });
  it('maps a link opened in another browser', () => {
    expect(authErrorCode({ message: 'PKCE code verifier not found in storage', code: 'validation_failed' })).toBe('wrong_browser');
    expect(authErrorCode({ message: 'invalid flow state, no valid flow state found', code: 'flow_state_not_found' })).toBe('wrong_browser');
  });
  it('falls back for anything else, including no error', () => {
    expect(authErrorCode({ message: 'boom', status: 500 })).toBe('auth_callback_failed');
    expect(authErrorCode(null)).toBe('auth_callback_failed');
    expect(authErrorCode(undefined)).toBe('auth_callback_failed');
  });
});
