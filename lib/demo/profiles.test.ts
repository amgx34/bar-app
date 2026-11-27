import { describe, it, expect } from 'vitest';
import { DEMO_PROFILES, profileSlug, shapeNights } from './profiles';
import { DEMO_SLUG_PREFIX } from './constants';

const nights = [
  { offset: 11, sales: 1000, ccTips: 180, servers: [{ name: 'Wes Berns', sales: 600, tips: 108 }, { name: 'Danny Rivera', sales: 400, tips: 72 }], shifts: [{ name: 'Wes Berns' }, { name: 'Danny Rivera' }] },
  { offset: 5, sales: 2000, ccTips: 360, servers: [{ name: 'Wes Berns', sales: 2000, tips: 360 }], shifts: [{ name: 'Wes Berns' }] },
];

describe('demo profiles', () => {
  it('every slug carries the sweep prefix and is unique', () => {
    const slugs = DEMO_PROFILES.map((p) => profileSlug(p, 'abc'));
    expect(slugs.every((s) => s.startsWith(DEMO_SLUG_PREFIX))).toBe(true);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('bars differ in name and role', () => {
    expect(new Set(DEMO_PROFILES.map((p) => p.name)).size).toBe(3);
    expect(new Set(DEMO_PROFILES.map((p) => p.role)).size).toBeGreaterThan(1);
  });

  it('scales sales, drops closed nights and absent staff, keeps ccTips equal to server tips', () => {
    const corner = DEMO_PROFILES.find((p) => p.key === 'corner')!;
    const out = shapeNights(nights, corner);
    expect(out.map((n) => n.offset)).toEqual([5]);
    expect(out[0].sales).toBe(900);
    expect(out[0].ccTips).toBe(162);
    const lounge = DEMO_PROFILES.find((p) => p.key === 'lounge')!;
    expect(shapeNights(nights, lounge)).toHaveLength(2);
    const tavern = shapeNights(nights, DEMO_PROFILES[0]);
    expect(tavern[0].sales).toBe(1000);
    expect(tavern[0].ccTips).toBe(180);
  });
});
