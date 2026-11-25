import { describe, expect, it } from 'vitest';
import { MAX_BEARER_LENGTH, parseBearer } from './bearer';

describe('parseBearer', () => {
  it('returns the token', () => {
    expect(parseBearer('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });
  it('is case-insensitive on the scheme', () => {
    expect(parseBearer('bearer t')).toBe('t');
    expect(parseBearer('BEARER t')).toBe('t');
  });
  it('trims and tolerates multiple spaces between scheme and token', () => {
    expect(parseBearer('  Bearer    tok  ')).toBe('tok');
  });
  it.each([null, undefined, '', '   ', 'Bearer', 'Bearer ', 'Basic x', 'Bearer a b', 'Bearer a\tb', 'Token abc', 'abc'])(
    'rejects %j',
    (v) => {
      expect(parseBearer(v)).toBeNull();
    },
  );
  it('limits length to 8192', () => {
    expect(MAX_BEARER_LENGTH).toBe(8192);
    expect(parseBearer('Bearer ' + 'a'.repeat(8192))).toBe('a'.repeat(8192));
    expect(parseBearer('Bearer ' + 'a'.repeat(8193))).toBeNull();
  });
  it('never throws or echoes the token on rejection', () => {
    expect(() => parseBearer('Bearer secret token')).not.toThrow();
    expect(parseBearer('Bearer secret token')).toBeNull();
  });
});
