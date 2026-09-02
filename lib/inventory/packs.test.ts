import { describe, it, expect } from 'vitest';
import { hasPack, toSingles, toPackDisplay, describePackCount } from './packs';

describe('hasPack', () => {
  it('treats a pack of one as no pack', () => {
    // Otherwise the UI would offer "1 case + 3 loose" as distinct from 4.
    expect(hasPack(1)).toBe(false);
    expect(hasPack(2)).toBe(true);
  });

  it('is false for the unset cases', () => {
    expect(hasPack(null)).toBe(false);
    expect(hasPack(undefined)).toBe(false);
    expect(hasPack(0)).toBe(false);
    expect(hasPack(NaN)).toBe(false);
  });
});

describe('toSingles', () => {
  it('converts a mixed count', () => {
    expect(toSingles({ packs: 2, loose: 9 }, 24)).toBe(57);
  });

  it('passes loose through when the item has no pack size', () => {
    expect(toSingles({ packs: 0, loose: 36 }, null)).toBe(36);
  });

  it('does not silently multiply when pack size is unset', () => {
    // A packs figure with no pack size cannot mean anything but singles;
    // inventing a multiplier would be a fabricated stock level.
    expect(toSingles({ packs: 3, loose: 2 }, null)).toBe(5);
  });

  it('floors fractional entries rather than storing half a sealed case', () => {
    expect(toSingles({ packs: 2.7, loose: 3.9 }, 24)).toBe(51);
  });

  it('clamps negatives to zero', () => {
    expect(toSingles({ packs: -2, loose: -5 }, 24)).toBe(0);
  });

  it('handles empty input', () => {
    expect(toSingles({ packs: 0, loose: 0 }, 24)).toBe(0);
  });
});

describe('toPackDisplay', () => {
  it('splits singles into packs and remainder', () => {
    expect(toPackDisplay(57, 24)).toEqual({ packs: 2, loose: 9 });
  });

  it('normalises an over-full loose count', () => {
    // Entered as 1 case + 30 loose; the cooler actually holds 2 cases + 6.
    expect(toPackDisplay(toSingles({ packs: 1, loose: 30 }, 24), 24)).toEqual({ packs: 2, loose: 6 });
  });

  it('reports everything as loose when there is no pack size', () => {
    expect(toPackDisplay(36, null)).toEqual({ packs: 0, loose: 36 });
  });

  it('handles an exact multiple', () => {
    expect(toPackDisplay(48, 24)).toEqual({ packs: 2, loose: 0 });
  });

  it('round-trips for every value', () => {
    for (const per of [2, 4, 6, 12, 24, 30]) {
      for (let n = 0; n < 200; n++) {
        expect(toSingles(toPackDisplay(n, per), per)).toBe(n);
      }
    }
  });

  it('re-splits rather than corrupting when pack size changes', () => {
    // The bar switches from 24-packs to 12-packs. Storage is singles, so the
    // count is untouched and only the display changes. This is the payoff for
    // not storing the purchase unit.
    const stored = toSingles({ packs: 2, loose: 9 }, 24); // 57
    expect(toPackDisplay(stored, 12)).toEqual({ packs: 4, loose: 9 });
    expect(toSingles(toPackDisplay(stored, 12), 12)).toBe(57);
  });
});

describe('describePackCount', () => {
  it('shows the total first, then the split', () => {
    expect(describePackCount(57, 24, 'case')).toBe('57 (2 cases + 9 loose)');
  });

  it('singularises one pack', () => {
    expect(describePackCount(24, 24, 'case')).toBe('24 (1 case)');
  });

  it('omits the loose clause on an exact multiple', () => {
    expect(describePackCount(48, 24, 'case')).toBe('48 (2 cases)');
  });

  it('is just the number below one full pack', () => {
    // "9 (0 cases + 9 loose)" tells a manager nothing they did not already know.
    expect(describePackCount(9, 24, 'case')).toBe('9');
  });

  it('is just the number with no pack size', () => {
    expect(describePackCount(36, null, 'can')).toBe('36');
  });
});
