import { describe, it, expect } from 'vitest';
import { businessDateOf, localHour, zonedMs, addDays } from './business-date';

const NY = 'America/New_York';
const at = (iso: string) => Date.parse(iso);

describe('businessDateOf', () => {
  it('rolls a 1:59 local ticket back to the night before, and 4:00 onto the new day', () => {
    // 2026-11-21 01:59 EST = 06:59Z
    expect(businessDateOf(at('2026-11-21T06:59:00Z'), NY, 4)).toBe('2026-11-20');
    expect(businessDateOf(at('2026-11-21T08:59:59Z'), NY, 4)).toBe('2026-11-20');
    expect(businessDateOf(at('2026-11-21T09:00:00Z'), NY, 4)).toBe('2026-11-21');
  });
  it('uses the venue zone, not the server zone', () => {
    // 03:00Z is still the previous evening in New York
    expect(businessDateOf(at('2026-11-21T03:00:00Z'), NY, 4)).toBe('2026-11-20');
    expect(businessDateOf(at('2026-11-21T03:00:00Z'), 'Asia/Tokyo', 4)).toBe('2026-11-21');
  });
  it('rolls across a month boundary', () => {
    expect(businessDateOf(at('2026-12-01T06:00:00Z'), NY, 4)).toBe('2026-11-30');
  });
  it('survives spring forward and fall back', () => {
    // 2026-03-08 spring forward 02:00 -> 03:00 in New York
    expect(businessDateOf(at('2026-03-08T07:30:00Z'), NY, 4)).toBe('2026-03-07'); // 03:30 EDT
    expect(businessDateOf(at('2026-03-08T08:00:00Z'), NY, 4)).toBe('2026-03-08'); // 04:00 EDT
    // 2026-11-01 fall back: 01:30 happens twice, both before the cutoff
    expect(businessDateOf(at('2026-11-01T05:30:00Z'), NY, 4)).toBe('2026-10-31');
    expect(businessDateOf(at('2026-11-01T06:30:00Z'), NY, 4)).toBe('2026-10-31');
    expect(businessDateOf(at('2026-11-01T09:00:00Z'), NY, 4)).toBe('2026-11-01'); // 04:00 EST
  });
});

describe('localHour', () => {
  it('reads the wall clock in the zone, midnight as 0', () => {
    expect(localHour(at('2026-11-21T05:10:00Z'), NY)).toBe(0);
    expect(localHour(at('2026-11-21T23:10:00Z'), NY)).toBe(18);
  });
});

describe('zonedMs and addDays', () => {
  it('finds the instant a local business day starts', () => {
    expect(new Date(zonedMs('2026-11-21', 4, NY)).toISOString()).toBe('2026-11-21T09:00:00.000Z');
    expect(new Date(zonedMs('2026-07-21', 4, NY)).toISOString()).toBe('2026-07-21T08:00:00.000Z');
  });
  it('adds days across months and leap years', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('half-hour zones', () => {
  it('applies the 5:30 offset', () => {
    expect(new Date(zonedMs('2026-11-21', 4, 'Asia/Kolkata')).toISOString()).toBe('2026-11-20T22:30:00.000Z');
  });
});
