import { describe, it, expect } from 'vitest';
import { checkPairs, contrastRatio, parseTokens, resolveHex } from './check-tokens';

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
  it('accepts 3-digit and upper-case hex, in either order', () => {
    expect(contrastRatio('#000', '#FFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
  });
  it('matches a known mid-grey value (#777 on white is 4.48)', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
  it('puts the primary blue on the page background above 4.5', () => {
    expect(contrastRatio('#1E40AF', '#F8FAFC')).toBeGreaterThan(4.5);
  });
});

describe('checkPairs', () => {
  const bad = { fgName: 'cta', bgName: 'card', fg: '#D97706', bg: '#FFFFFF', kind: 'text' as const };
  const ok = { fgName: 'foreground', bgName: 'background', fg: '#000000', bg: '#FFFFFF', kind: 'text' as const };
  it('names both tokens, the ratio and the threshold of a failure', () => {
    const [f] = checkPairs([ok, bad]);
    expect(f.fgName).toBe('cta');
    expect(f.bgName).toBe('card');
    expect(f.required).toBe(4.5);
    expect(f.ratio).toBeLessThan(4.5);
  });
  it('reports every failure, not just the first', () => {
    expect(checkPairs([bad, ok, { ...bad, fgName: 'other' }])).toHaveLength(2);
  });
  it('uses 3:1 for ui pairs', () => {
    const ui = { fgName: 'input', bgName: 'card', fg: '#767676', bg: '#FFFFFF', kind: 'ui' as const };
    expect(checkPairs([ui])).toHaveLength(0);
    expect(checkPairs([{ ...ui, kind: 'text' as const }])).toHaveLength(0); // 4.54
    expect(checkPairs([{ ...ui, fg: '#999999' }])).toHaveLength(1); // 2.85
  });
});

describe('parseTokens', () => {
  const css = `@theme inline { --color-card: var(--card); }
:root {
  --card: #FFF; /* c */
  --ring: var(--card);
}
.dark {
  --card: #000000;
}
@media print { :root { --card: #fff; } }`;
  it('splits light and dark and keeps raw values', () => {
    const t = parseTokens(css);
    expect(t.light.card).toBe('#FFF');
    expect(t.dark.card).toBe('#000000');
    expect(t.light['color-card']).toBeUndefined();
  });
  it('resolves var() references and refuses non-hex', () => {
    const t = parseTokens(css);
    expect(resolveHex(t.light, 'ring')).toBe('#FFF');
    expect(() => resolveHex(t.light, 'nope')).toThrow(/nope/);
  });
});
