import { describe, it, expect } from 'vitest';
import { toCents, centsToDollars, sumCents } from './money';

describe('integer cents', () => {
  it('converts dollars without float drift', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(1.15)).toBe(115);
  });
  it('sums as integers and emits exact dollars', () => {
    expect(centsToDollars(sumCents([1999, 1999, 1999]))).toBe(59.97);
    // 0.1 + 0.2 in floats is 0.30000000000000004
    expect(centsToDollars(sumCents([10, 20]))).toBe(0.3);
  });
  it('handles negatives and zero', () => {
    expect(centsToDollars(-1050)).toBe(-10.5);
    expect(centsToDollars(0)).toBe(0);
  });
  it('treats junk as zero rather than NaN', () => {
    expect(toCents(Number.NaN)).toBe(0);
    expect(toCents(undefined)).toBe(0);
  });
});
