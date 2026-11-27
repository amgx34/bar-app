import { describe, it, expect } from 'vitest';
import { formatMoney } from './money';

describe('formatMoney', () => {
  it('groups thousands and always shows cents', () => {
    expect(formatMoney(1212)).toBe('$1,212.00');
    expect(formatMoney(0.5)).toBe('$0.50');
    expect(formatMoney(24000)).toBe('$24,000.00');
  });
});
