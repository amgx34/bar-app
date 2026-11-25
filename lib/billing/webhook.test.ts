import { describe, it, expect } from 'vitest';
import { shouldApplyEvent, checkoutOrgId } from './webhook';

describe('shouldApplyEvent', () => {
  const created = Date.parse('2026-12-10T12:00:00Z') / 1000;
  it('applies when nothing is stored', () => {
    expect(shouldApplyEvent(null, created)).toBe(true);
    expect(shouldApplyEvent(undefined, created)).toBe(true);
  });
  it('compares instants, not strings: a +00:00 stored value vs a Z event', () => {
    expect(shouldApplyEvent('2026-12-10T12:00:00+00:00', created)).toBe(true);
    expect(shouldApplyEvent('2026-12-10T13:00:00+00:00', created)).toBe(false);
    expect(shouldApplyEvent('2026-12-10T14:00:00+02:00', created)).toBe(true); // 12:00Z, same instant
    expect(shouldApplyEvent('2026-12-10T14:00:01+02:00', created)).toBe(false); // 12:00:01Z, newer
  });
  it('ignores an unparseable stored value', () => {
    expect(shouldApplyEvent('garbage', created)).toBe(true);
  });
});

describe('checkoutOrgId', () => {
  it('prefers subscription metadata, falls back to client_reference_id, else null', () => {
    expect(checkoutOrgId('a', 'b')).toBe('a');
    expect(checkoutOrgId(undefined, 'b')).toBe('b');
    expect(checkoutOrgId(undefined, undefined)).toBeNull();
    expect(checkoutOrgId('', '')).toBeNull();
  });
});
