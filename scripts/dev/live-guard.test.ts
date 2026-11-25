import { describe, it, expect } from 'vitest';
import { assertDevIsNotLive, normalizeHost, readEnvValue } from './live-guard';

describe('normalizeHost', () => {
  it('lower-cases and drops scheme and trailing slash', () => {
    expect(normalizeHost('HTTPS://AbC.supabase.co/')).toBe('abc.supabase.co');
  });
  it('drops port and path', () => {
    expect(normalizeHost('http://ABC.supabase.co:443/rest/v1')).toBe('abc.supabase.co');
  });
  it('accepts a bare host with no scheme', () => {
    expect(normalizeHost('abc.supabase.co')).toBe('abc.supabase.co');
  });
  it('returns an empty string for empty input', () => {
    expect(normalizeHost('')).toBe('');
  });
});

describe('readEnvValue', () => {
  const text = 'A=1\n# B=2\nC="x y"\nD=\'q\'\n';
  it('reads a plain value', () => {
    expect(readEnvValue(text, 'A')).toBe('1');
  });
  it('ignores commented-out lines', () => {
    expect(readEnvValue(text, 'B')).toBeUndefined();
  });
  it('strips double and single quotes', () => {
    expect(readEnvValue(text, 'C')).toBe('x y');
    expect(readEnvValue(text, 'D')).toBe('q');
  });
  it('does not match a key that only ends with the name', () => {
    expect(readEnvValue('XA=9\n', 'A')).toBeUndefined();
  });
  it('handles Windows line endings', () => {
    expect(readEnvValue('A=1\r\nB=2\r\n', 'B')).toBe('2');
  });
});

describe('assertDevIsNotLive', () => {
  const live = 'https://liveproj.supabase.co';
  it('throws when dev points at the live project, even with different case and a trailing slash', () => {
    expect(() => assertDevIsNotLive('HTTPS://LiveProj.supabase.co/', live, false)).toThrow(/live/i);
  });
  it('throws when dev and live differ only by scheme', () => {
    expect(() => assertDevIsNotLive('http://liveproj.supabase.co', live, false)).toThrow();
  });
  it('passes when the hosts differ', () => {
    expect(() => assertDevIsNotLive('https://devproj.supabase.co', live, false)).not.toThrow();
  });
  it('passes when there is no .env.local to compare against', () => {
    expect(() => assertDevIsNotLive('https://devproj.supabase.co', undefined, false)).not.toThrow();
  });
  it('throws when no dev URL is configured at all', () => {
    expect(() => assertDevIsNotLive(undefined, live, false)).toThrow();
    expect(() => assertDevIsNotLive('', live, false)).toThrow();
  });
  it('throws on a placeholder that was never replaced, not a host', () => {
    expect(() => assertDevIsNotLive('PASTE_NEW_PROJECT_URL_HERE', live, false)).toThrow(/not a real|placeholder|replace/i);
  });
  it('accepts a local Supabase address', () => {
    expect(() => assertDevIsNotLive('http://127.0.0.1:54321', live, false)).not.toThrow();
    expect(() => assertDevIsNotLive('http://localhost:54321', live, false)).not.toThrow();
  });
  it('lets the owner override on purpose', () => {
    expect(() => assertDevIsNotLive(live, live, true)).not.toThrow();
  });
});
