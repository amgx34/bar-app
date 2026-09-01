/**
 * POS size variants — SGL, DBL, RSGL, RDB.
 *
 * Pure — no database, no clock.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────────
 *
 * 2Touch rings a double as its own item. `tblItem.szDescription` comes across
 * as "DBL TITO'S", which normalises to a match key of its own, matches no
 * inventory item, and so:
 *
 *   - costs nothing and reports no margin,
 *   - deducts no stock at all,
 *   - and gets auto-created by the ingest as a phantom inventory row sitting
 *     next to the real "Tito's".
 *
 * Meanwhile the bar poured two ounces. This module reads the size off the name
 * so the sale can be attributed to the item inventory actually knows about, and
 * multiplied by what was really poured.
 *
 * ── R IS RED BULL, NOT ROCKS ─────────────────────────────────────────────────
 *
 * RSGL and RDB are a single and a double served with Red Bull. The R changes
 * what else goes in the glass, NOT how much liquor is poured — so RSGL carries
 * the same 1x multiplier as SGL, and RDB the same 2x as DBL.
 *
 * The Red Bull itself is deliberately NOT deducted here. That is a second
 * inventory item on the same line, which is exactly what `pos_bundles` already
 * models, and inventing a parallel mechanism for it would give the bar two
 * places to configure one drink. `mixer` below records what the token implies
 * so the UI can say so; nothing consumes it yet.
 */

import { posItemMatchKey } from './excluded-items';

export type SizeToken = {
  /** Normalised, lower-case. What appears in the POS name. */
  token: string;
  /**
   * Multiplier on the item's configured pour. 2 means a DBL pours twice what
   * the pour size says, and so costs and deducts twice as much.
   */
  multiplier: number;
  /** Shown in the UI. */
  label: string;
  /**
   * What else the token implies is in the glass, for display only. Null when
   * the token is purely a size. Nothing deducts this yet — see the note above.
   */
  mixer: string | null;
};

/**
 * The tokens every bar gets without configuring anything.
 *
 * A bar can override these (see `buildTokenTable`); these are the defaults for
 * an org that has not. Deliberately a small set — each one is a claim about
 * what a name means, and a wrong claim silently re-attributes revenue.
 */
export const DEFAULT_SIZE_TOKENS: SizeToken[] = [
  { token: 'sgl', multiplier: 1, label: 'Single', mixer: null },
  { token: 'dbl', multiplier: 2, label: 'Double', mixer: null },
  { token: 'rsgl', multiplier: 1, label: 'Single + Red Bull', mixer: 'Red Bull' },
  { token: 'rdb', multiplier: 2, label: 'Double + Red Bull', mixer: 'Red Bull' },
];

export type TokenTable = Map<string, SizeToken>;

/**
 * Builds the lookup used by the parser.
 *
 * Rows come from the org's own `pos_size_tokens`; an org with none falls back
 * to the defaults rather than to "no parsing at all", because the four built-in
 * tokens are near-universal on 2Touch and requiring setup would leave every
 * existing bar mis-costing doubles until someone noticed.
 *
 * A multiplier of zero or less is dropped: it would zero out the cost of every
 * drink carrying that token, which reads as pure profit.
 */
export function buildTokenTable(rows?: SizeToken[] | null): TokenTable {
  const source = rows && rows.length > 0 ? rows : DEFAULT_SIZE_TOKENS;
  const table: TokenTable = new Map();

  for (const row of source) {
    const token = String(row.token ?? '').trim().toLowerCase();
    const multiplier = Number(row.multiplier);
    if (!token) continue;
    if (!Number.isFinite(multiplier) || multiplier <= 0) continue;

    table.set(token, {
      token,
      multiplier,
      label: String(row.label ?? '').trim() || token.toUpperCase(),
      mixer: row.mixer ? String(row.mixer).trim() || null : null,
    });
  }

  return table;
}

export type ParsedVariant = {
  /** The item name with the size token removed, whitespace collapsed. */
  baseName: string;
  /** `baseName` through the same normalisation every other match key uses. */
  baseMatchKey: string;
  /** The token found, normalised. Null when the name carries no size. */
  sizeToken: string | null;
  /** Pour multiplier. Always 1 when `sizeToken` is null. */
  multiplier: number;
  /** The token's display label, or null. */
  label: string | null;
  /** The token's implied mixer, for display. Null when none. */
  mixer: string | null;
};

/** Strips punctuation a POS might pad a token with: "DBL." or "(DBL)". */
function bareWord(word: string): string {
  return word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '').toLowerCase();
}

/**
 * Reads the size token off a POS item name.
 *
 * The token is matched as a WHOLE WORD at either the start or the end of the
 * name, so both "DBL TITO'S" and "TITO'S DBL" resolve. Matching anywhere inside
 * the name would be worse than useless: it would rewrite an item legitimately
 * containing the letters, and the failure would be silent.
 *
 * Only ONE token is stripped. A name reading "DBL DBL" is far more likely to be
 * a genuine item name than a quadruple, and guessing the second is a two-fold
 * error in the cost of every one sold.
 *
 * A name that is NOTHING BUT a token ("DBL") parses as no variant. Stripping it
 * would leave an empty base name, and every such line across every unrelated
 * item would then collapse onto one another.
 */
export function parseVariant(
  itemName: string,
  tokens: TokenTable = buildTokenTable(),
): ParsedVariant {
  const name = String(itemName ?? '').replace(/\s+/g, ' ').trim();
  const none: ParsedVariant = {
    baseName: name,
    baseMatchKey: posItemMatchKey(name),
    sizeToken: null,
    multiplier: 1,
    label: null,
    mixer: null,
  };

  if (!name) return none;

  const words = name.split(' ');
  // A single-word name has no room for both a token and an item.
  if (words.length < 2) return none;

  const first = tokens.get(bareWord(words[0]));
  const last = tokens.get(bareWord(words[words.length - 1]));

  // Leading wins. 2Touch's own naming puts the size in front ("DBL TITO'S"),
  // and a name with a token at both ends is ambiguous rather than a double
  // double — resolving it consistently beats resolving it cleverly.
  const match = first ?? last;
  if (!match) return none;

  const rest = first ? words.slice(1) : words.slice(0, -1);
  const baseName = rest.join(' ').trim();
  if (!baseName) return none;

  return {
    baseName,
    baseMatchKey: posItemMatchKey(baseName),
    sizeToken: match.token,
    multiplier: match.multiplier,
    label: match.label,
    mixer: match.mixer,
  };
}
