/**
 * Packs and singles.
 *
 * Pure — no database, no clock.
 *
 * A bar buys canned beer by the case and counts it as "2 cases and 9 loose",
 * but the POS sells one can at a time. Stock is therefore stored in SINGLES,
 * always, and this module exists only to translate between that canonical
 * number and the way a person says it out loud.
 *
 * That boundary is the whole design. `units_per_pack` is read here and by the
 * two screens that call these functions, and nowhere else — never by depletion,
 * COGS, par comparison or velocity. Depletion subtracts exactly what the POS
 * rang, 1:1, which is already correct; the surest way to break it would be to
 * route a second conversion through it, which is how the pour bug and the
 * pos_stock_applications delta bug both happened.
 *
 * Contrast lib/pos/pour.ts, which converts by VOLUME for liquid. A 24-pack is
 * not 24 pours of a case — it is 24 discrete things, and an integer count is
 * the honest way to say so.
 */

/** A count as a person gives it: some sealed packs, some loose singles. */
export type PackCount = {
  packs: number;
  loose: number;
};

/**
 * Is this item bought in packs?
 *
 * Zero and one are both "no": a pack of one is not a pack, and treating it as
 * one would let the UI offer "1 case + 3 loose" as something different from 4.
 */
export function hasPack(unitsPerPack: number | null | undefined): boolean {
  const n = Number(unitsPerPack);
  return Number.isFinite(n) && n > 1;
}

/**
 * "2 cases + 9 loose" -> 57 singles.
 *
 * Fractional or negative entries are floored to zero rather than propagated:
 * this is the number that becomes current_stock, and half a sealed case is not
 * a thing a person counts.
 */
export function toSingles(count: PackCount, unitsPerPack: number | null | undefined): number {
  const loose = Math.max(0, Math.floor(Number(count.loose) || 0));
  const packs = Math.max(0, Math.floor(Number(count.packs) || 0));

  if (!hasPack(unitsPerPack)) return loose + packs;
  return packs * Number(unitsPerPack) + loose;
}

/**
 * 57 singles -> "2 cases + 9 loose".
 *
 * The inverse of toSingles, and deliberately normalising: 1 pack + 30 loose
 * with a pack of 24 comes back as 2 packs + 6, so a count entered loosely
 * displays the way the cooler actually looks.
 *
 * Because storage is canonical singles, changing an item's pack size later
 * cannot corrupt a stored count — it only re-splits the display. That is the
 * payoff for not storing the purchase unit.
 */
export function toPackDisplay(
  singles: number,
  unitsPerPack: number | null | undefined,
): PackCount {
  const total = Math.max(0, Math.floor(Number(singles) || 0));
  if (!hasPack(unitsPerPack)) return { packs: 0, loose: total };

  const per = Number(unitsPerPack);
  return { packs: Math.floor(total / per), loose: total % per };
}

/**
 * "57 (2 cases + 9)" for a table cell.
 *
 * `unitLabel` is the item's own `unit` string, so a bar that calls them cases
 * sees cases and one that calls them packs sees packs.
 */
export function describePackCount(
  singles: number,
  unitsPerPack: number | null | undefined,
  unitLabel = 'pack',
): string {
  const total = Math.max(0, Math.floor(Number(singles) || 0));
  if (!hasPack(unitsPerPack)) return String(total);

  const { packs, loose } = toPackDisplay(total, unitsPerPack);
  if (packs === 0) return String(total);

  const packWord = packs === 1 ? unitLabel : `${unitLabel}s`;
  const parts = [`${packs} ${packWord}`];
  if (loose > 0) parts.push(`${loose} loose`);
  return `${total} (${parts.join(' + ')})`;
}
