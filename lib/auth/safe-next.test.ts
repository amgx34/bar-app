import { describe, it, expect } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  const fb = '/app/dashboard';
  it.each([
    '@evil.example', '//evil.example', '/\\evil', '/\\/evil', 'https://x',
    'javascript:alert(1)', '', '/a\nb', '/a\u0000b', '/a\tb', 'app/dashboard',
  ])('rejects %j', (v) => expect(safeNext(v, fb)).toBe(fb));

  it('rejects non-strings', () => {
    expect(safeNext(null, fb)).toBe(fb);
    expect(safeNext(undefined, fb)).toBe(fb);
  });

  it('accepts same-site paths', () => {
    expect(safeNext('/app/dashboard?x=1', fb)).toBe('/app/dashboard?x=1');
    expect(safeNext('/setup', fb)).toBe('/setup');
  });
});
