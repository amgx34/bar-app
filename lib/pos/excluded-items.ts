/**
 * Items the POS sells that the bar does not stock — deals, combos, pitchers.
 *
 * These ring up like products but are pricing constructs, so syncing them
 * creates inventory rows that can never be counted or reordered.
 */

/**
 * Normalises a POS item name for comparison.
 *
 * Must stay identical to `pos_item_match_key()` in the migration: if the two
 * ever disagree, an exclusion silently stops applying and the deal quietly
 * reappears in inventory.
 */
export function posItemMatchKey(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Builds a lookup for the ingest hot path — one pass, then O(1) per row. */
export function buildExclusionSet(rows: { match_key: string }[]): Set<string> {
  return new Set(rows.map((r) => r.match_key));
}

export function isExcluded(name: string, exclusions: Set<string>): boolean {
  return exclusions.has(posItemMatchKey(name));
}
