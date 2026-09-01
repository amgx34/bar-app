/**
 * The single definition of "this item is below par".
 *
 * This predicate was written three separate times — the dashboard, the org
 * analytics page and the inventory analytics page — with subtly different null
 * handling. The dashboard coerced through Number() and guarded NaN; the other
 * two compared the raw column. A par_level stored as the string '0' therefore
 * counted as "has a par level" in two of the three places and not the third.
 *
 * Low-stock notifications made that divergence expensive: an alert that
 * disagrees with the screen it links to is worse than no alert.
 */
export type ParCheckable = {
  current_stock: number | null;
  par_level:     number | string | null;
};

/** A par level only means something if it parses to a positive number. */
export function hasPar(item: ParCheckable): boolean {
  if (item.par_level === null || item.par_level === '') return false;
  const par = Number(item.par_level);
  return Number.isFinite(par) && par > 0;
}

/**
 * Strictly below, never equal — an item sitting exactly at par is stocked to
 * the level its par says it should be, and firing there would alert on every
 * correctly-stocked item the moment it was counted.
 */
export function isBelowPar(item: ParCheckable): boolean {
  if (!hasPar(item)) return false;
  return Number(item.current_stock ?? 0) < Number(item.par_level);
}

/** How far below par, as a fraction of par. Used to rank the worst first. */
export function parRatio(item: ParCheckable): number {
  if (!hasPar(item)) return 1;
  return Number(item.current_stock ?? 0) / Number(item.par_level);
}
