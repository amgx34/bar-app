/**
 * Which drinks earn their place on the menu.
 *
 * Pure — no database, no clock.
 *
 * The classic four quadrants, popularity against margin:
 *
 *   star       popular, profitable    — protect it, never discount it
 *   plowhorse  popular, thin          — it brings people in; find cost, not price
 *   puzzle     profitable, ignored    — worth promoting or moving up the list
 *   dog        neither                — the candidate to delist
 *
 * WHY THE SPLIT IS THE MEDIAN AND NOT A BENCHMARK
 *
 * A dive bar and a cocktail bar sit in completely different absolute margin
 * ranges, and both have stars. Splitting at this bar's OWN median asks the only
 * useful question — "compared with the rest of what you sell" — and keeps the
 * output meaningful for a menu whose every item would fail an industry target.
 *
 * An item with no cost price is 'unknown', never a dog. Guessing would tell an
 * operator to delist a drink on no evidence, and uncosted items are excluded
 * from the medians entirely so they cannot drag the split and mis-sort the
 * items that ARE costed.
 */

import type { ItemMargin } from './sales-analytics';

export type MenuClass = 'star' | 'plowhorse' | 'puzzle' | 'dog' | 'unknown';

export const MENU_CLASS_LABEL: Record<MenuClass, string> = {
  star: 'Star',
  plowhorse: 'Plowhorse',
  puzzle: 'Puzzle',
  dog: 'Dog',
  unknown: 'Not costed',
};

const ADVICE: Record<MenuClass, string> = {
  star: 'Sells well and earns well. Protect it — never put this one on discount.',
  plowhorse: 'Popular but thin. Work on what it costs you before you touch the price.',
  puzzle: 'Earns well but nobody orders it. Move it up the list or push it at the bar.',
  dog: 'Neither popular nor profitable. The first candidate to come off the menu.',
  unknown: 'No cost price recorded, so its margin is unknown. Price it to classify it.',
};

export type MenuItem = {
  matchKey: string;
  itemName: string;
  categoryName: string | null;
  unitsSold: number;
  revenue: number;
  marginPct: number | null;
  menuClass: MenuClass;
  advice: string;
};

export type MenuBoard = {
  items: MenuItem[];
  /** The popularity split actually used. */
  medianUnits: number;
  /** The margin split actually used. Null when nothing was costed. */
  medianMarginPct: number | null;
  /** How many items could not be classified for want of a cost price. */
  uncosted: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function classifyMenu(items: ItemMargin[]): MenuBoard {
  const all = items ?? [];

  // Only costed items define the splits. An uncosted item counted as zero
  // margin would drag the median down and mis-sort everything above it.
  const costed = all.filter((i) => i.costKnown && i.marginPct !== null);

  const medianUnits = median(costed.map((i) => i.unitsSold)) ?? 0;
  const medianMarginPct = median(costed.map((i) => i.marginPct as number));

  const classified: MenuItem[] = all.map((i) => {
    const known = i.costKnown && i.marginPct !== null && medianMarginPct !== null;

    // Ties go to the favourable side: an item sitting exactly on the median
    // should not be called a dog on a rounding accident.
    const popular = i.unitsSold >= medianUnits;
    const profitable = known && (i.marginPct as number) >= medianMarginPct;

    const menuClass: MenuClass = !known
      ? 'unknown'
      : popular && profitable ? 'star'
      : popular ? 'plowhorse'
      : profitable ? 'puzzle'
      : 'dog';

    return {
      matchKey: i.matchKey,
      itemName: i.itemName,
      categoryName: i.categoryName,
      unitsSold: i.unitsSold,
      revenue: i.revenue,
      marginPct: i.marginPct,
      menuClass,
      advice: ADVICE[menuClass],
    };
  });

  return {
    items: classified,
    medianUnits,
    medianMarginPct,
    uncosted: classified.filter((i) => i.menuClass === 'unknown').length,
  };
}
