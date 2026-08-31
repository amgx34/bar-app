import { describe, it, expect } from 'vitest';
import { classifyMenu, MENU_CLASS_LABEL } from './menu-engineering';
import type { ItemMargin } from './sales-analytics';

const item = (
  name: string, units: number, marginPct: number | null, costKnown = true,
): ItemMargin => ({
  matchKey: name.toLowerCase(),
  itemName: name,
  categoryName: null,
  unitsSold: units,
  revenue: units * 10,
  costPerDrink: costKnown ? 3 : null,
  cost: costKnown ? units * 3 : 0,
  margin: costKnown ? units * 7 : null,
  marginPct,
  costKnown,
});

describe('classifyMenu', () => {
  // Popularity and margin are each split at the MEDIAN of this bar's own menu,
  // not at an industry number: a dive bar and a cocktail bar sit in different
  // absolute ranges and both have stars.
  const menu = [
    item('House Vodka', 100, 80),  // popular, high margin  -> star
    item('Cheap Lager', 100, 20),  // popular, low margin   -> plowhorse
    item('Rare Whisky', 5, 80),    // unpopular, high margin-> puzzle
    item('Odd Liqueur', 5, 20),    // unpopular, low margin -> dog
  ];

  it('sorts the four quadrants', () => {
    const byName = new Map(classifyMenu(menu).items.map((i) => [i.itemName, i.menuClass]));
    expect(byName.get('House Vodka')).toBe('star');
    expect(byName.get('Cheap Lager')).toBe('plowhorse');
    expect(byName.get('Rare Whisky')).toBe('puzzle');
    expect(byName.get('Odd Liqueur')).toBe('dog');
  });

  it('splits at this bar\'s own medians, not an industry benchmark', () => {
    // Every item here would be "low margin" against a generic 70% target, yet
    // this menu still has stars — which is the entire point of the technique.
    const thin = [
      item('A', 100, 12), item('B', 100, 4), item('C', 5, 12), item('D', 5, 4),
    ];
    const byName = new Map(classifyMenu(thin).items.map((i) => [i.itemName, i.menuClass]));
    expect(byName.get('A')).toBe('star');
    expect(byName.get('D')).toBe('dog');
  });

  it('refuses to classify an item whose cost is unknown', () => {
    // Guessing here would tell an operator to delist a drink on no evidence.
    const out = classifyMenu([...menu, item('Mystery', 50, null, false)]);
    const mystery = out.items.find((i) => i.itemName === 'Mystery')!;
    expect(mystery.menuClass).toBe('unknown');
    expect(out.uncosted).toBe(1);
  });

  it('keeps uncosted items out of the median entirely', () => {
    // Letting them count as zero margin would drag the split down and
    // mis-sort every real item on the menu.
    const withUncosted = classifyMenu([...menu, item('Mystery', 100, null, false)]);
    expect(withUncosted.medianMarginPct).toBe(classifyMenu(menu).medianMarginPct);
  });

  it('gives each class advice an operator can act on', () => {
    const out = classifyMenu(menu);
    for (const i of out.items) {
      expect(i.advice.length).toBeGreaterThan(0);
    }
    expect(new Set(out.items.map((i) => i.advice)).size).toBe(4);
  });

  it('reports the medians it split on, so the screen can show its working', () => {
    const out = classifyMenu(menu);
    expect(out.medianUnits).toBeGreaterThan(0);
    expect(out.medianMarginPct).not.toBeNull();
  });

  it('handles an empty menu without dividing by zero', () => {
    const out = classifyMenu([]);
    expect(out.items).toEqual([]);
    expect(out.medianMarginPct).toBeNull();
    expect(out.uncosted).toBe(0);
  });

  it('classifies nothing when no item has a known cost', () => {
    const out = classifyMenu([item('A', 10, null, false), item('B', 20, null, false)]);
    expect(out.items.every((i) => i.menuClass === 'unknown')).toBe(true);
    expect(out.medianMarginPct).toBeNull();
  });

  it('puts an item exactly on the median on the favourable side', () => {
    // A boundary item should not be called a dog on a rounding accident.
    const out = classifyMenu([item('A', 10, 50), item('B', 10, 50)]);
    expect(out.items.every((i) => i.menuClass === 'star')).toBe(true);
  });

  it('labels every class', () => {
    for (const c of ['star', 'plowhorse', 'puzzle', 'dog', 'unknown'] as const) {
      expect(MENU_CLASS_LABEL[c].length).toBeGreaterThan(0);
    }
  });
});
