import { describe, it, expect } from 'vitest';
import { validateRoutingNumber } from './routing';

describe('validateRoutingNumber', () => {
  it('accepts real ABA routing numbers', () => {
    expect(validateRoutingNumber('021000021')).toBe(true); // JPMorgan Chase
    expect(validateRoutingNumber('011401533')).toBe(true);
  });
  it('rejects a number that is too short, such as the 12345 that used to save', () => {
    expect(validateRoutingNumber('12345')).toBe(false);
  });
  it('rejects nine digits that fail the checksum', () => {
    expect(validateRoutingNumber('123456789')).toBe(false);
  });
  it('rejects blank and non-digits', () => {
    expect(validateRoutingNumber('')).toBe(false);
    expect(validateRoutingNumber('02100002a')).toBe(false);
  });
});
