import { describe, it, expect } from 'vitest';
import {
  parseVariant,
  buildTokenTable,
  DEFAULT_SIZE_TOKENS,
  type SizeToken,
} from './variants';

/**
 * Reading the size off a POS item name.
 *
 * Everything downstream trusts this: a wrong base key attributes revenue to the
 * wrong item, and a wrong multiplier is a two-fold error in cost and in stock.
 * The cases below are the ones where being clever would be worse than being
 * predictable.
 */

describe('parseVariant', () => {
  it('reads a leading token, the way 2Touch names them', () => {
    const v = parseVariant("DBL TITO'S");
    expect(v.sizeToken).toBe('dbl');
    expect(v.multiplier).toBe(2);
    expect(v.baseName).toBe("TITO'S");
    expect(v.baseMatchKey).toBe("tito's");
  });

  it('reads a trailing token too', () => {
    const v = parseVariant("Tito's DBL");
    expect(v.sizeToken).toBe('dbl');
    expect(v.baseMatchKey).toBe("tito's");
  });

  it('resolves every default token to the right multiplier', () => {
    expect(parseVariant('SGL JAMESON').multiplier).toBe(1);
    expect(parseVariant('DBL JAMESON').multiplier).toBe(2);
    expect(parseVariant('RSGL JAMESON').multiplier).toBe(1);
    expect(parseVariant('RDB JAMESON').multiplier).toBe(2);
  });

  it('R is Red Bull, so it changes the mixer but never the pour', () => {
    const single = parseVariant('SGL JAMESON');
    const withRedBull = parseVariant('RSGL JAMESON');

    // Same liquor, same pour, same base item.
    expect(withRedBull.multiplier).toBe(single.multiplier);
    expect(withRedBull.baseMatchKey).toBe(single.baseMatchKey);
    // What differs is what else is in the glass.
    expect(single.mixer).toBeNull();
    expect(withRedBull.mixer).toBe('Red Bull');
  });

  it('a double with Red Bull still pours a double', () => {
    expect(parseVariant('RDB TITO\'S').multiplier).toBe(2);
    expect(parseVariant('RDB TITO\'S').mixer).toBe('Red Bull');
  });

  it('leaves an ordinary item alone', () => {
    const v = parseVariant('Bud Light');
    expect(v.sizeToken).toBeNull();
    expect(v.multiplier).toBe(1);
    expect(v.baseName).toBe('Bud Light');
    expect(v.baseMatchKey).toBe('bud light');
  });

  it('never matches a token buried inside the name', () => {
    // If this matched, an item would silently lose a word and merge into
    // whatever the remainder happens to key to.
    const v = parseVariant('Old Dbl Barrel Bourbon');
    expect(v.sizeToken).toBeNull();
    expect(v.baseMatchKey).toBe('old dbl barrel bourbon');
  });

  it('only matches whole words, not prefixes of longer ones', () => {
    const v = parseVariant('DBLWOOD Scotch');
    expect(v.sizeToken).toBeNull();
    expect(v.baseMatchKey).toBe('dblwood scotch');
  });

  it('refuses a name that is nothing but a token', () => {
    // Stripping this leaves an empty base, and every bare token across every
    // unrelated item would collapse onto the same key.
    const v = parseVariant('DBL');
    expect(v.sizeToken).toBeNull();
    expect(v.baseMatchKey).toBe('dbl');
  });

  it('strips only one token from a doubled-up name', () => {
    const v = parseVariant('DBL DBL VODKA');
    expect(v.multiplier).toBe(2);
    expect(v.baseName).toBe('DBL VODKA');
  });

  it('prefers the leading token when both ends carry one', () => {
    const v = parseVariant('DBL VODKA SGL');
    expect(v.sizeToken).toBe('dbl');
    expect(v.baseName).toBe('VODKA SGL');
  });

  it('tolerates the punctuation a POS pads a token with', () => {
    expect(parseVariant('DBL. Tito\'s').sizeToken).toBe('dbl');
    expect(parseVariant('(DBL) Tito\'s').sizeToken).toBe('dbl');
  });

  it('is case- and whitespace-insensitive, like every other match key', () => {
    const v = parseVariant('  dbl    Tito\'s  ');
    expect(v.sizeToken).toBe('dbl');
    expect(v.baseMatchKey).toBe("tito's");
  });

  it('normalises the base the same way posItemMatchKey does', () => {
    // Variant and plain sale of one item must land on ONE key, or the sales
    // report shows the same bottle twice.
    expect(parseVariant('DBL   Bud   Light').baseMatchKey)
      .toBe(parseVariant('Bud Light').baseMatchKey);
  });

  it('handles an empty or missing name without throwing', () => {
    expect(parseVariant('').sizeToken).toBeNull();
    expect(parseVariant(undefined as unknown as string).baseMatchKey).toBe('');
  });
});

describe('buildTokenTable', () => {
  it('falls back to the defaults for an org that configured nothing', () => {
    // Not "no parsing": the four tokens are near-universal on 2Touch, and
    // requiring setup would leave every existing bar mis-costing doubles.
    expect(buildTokenTable().size).toBe(DEFAULT_SIZE_TOKENS.length);
    expect(buildTokenTable([]).get('dbl')?.multiplier).toBe(2);
    expect(buildTokenTable(null).get('rdb')?.multiplier).toBe(2);
  });

  it('lets a bar define its own tokens', () => {
    const table = buildTokenTable([
      { token: 'TRP', multiplier: 3, label: 'Triple', mixer: null },
    ]);
    expect(parseVariant('TRP TITO\'S', table).multiplier).toBe(3);
    // Configuring a table replaces the defaults rather than extending them,
    // so this bar's names mean exactly what it says they mean.
    expect(parseVariant('DBL TITO\'S', table).sizeToken).toBeNull();
  });

  it('drops a multiplier of zero or less', () => {
    // A zero multiplier costs nothing to pour, which reads as pure profit.
    const table = buildTokenTable([
      { token: 'free', multiplier: 0, label: 'Free', mixer: null },
      { token: 'neg', multiplier: -2, label: 'Negative', mixer: null },
      { token: 'dbl', multiplier: 2, label: 'Double', mixer: null },
    ]);
    expect(table.has('free')).toBe(false);
    expect(table.has('neg')).toBe(false);
    expect(table.has('dbl')).toBe(true);
  });

  it('normalises configured tokens so casing in the table does not matter', () => {
    const table = buildTokenTable([
      { token: '  DBL ', multiplier: 2, label: 'Double', mixer: null },
    ]);
    expect(parseVariant("dbl tito's", table).multiplier).toBe(2);
  });

  it('falls back to the token itself when no label is given', () => {
    const table = buildTokenTable([
      { token: 'trp', multiplier: 3, label: '', mixer: null } as SizeToken,
    ]);
    expect(table.get('trp')?.label).toBe('TRP');
  });
});
