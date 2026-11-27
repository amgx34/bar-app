/**
 * Which flat icon stands in for an item that has no picture, chosen from its name.
 * Whole words only, first rule that matches wins, so the order below IS the
 * precedence: supplies, then what the drink is, then how it is packed, then what
 * it is made of. "High Noon Vodka Soda" is a seltzer; "Cherry Vodka" is a vodka.
 */
const RULES = [
  ['liqueur', 'liqueur|liqueurs|pimms'], // first: "Maraschino Liqueur" and "Pimm's No. 1 Cup"
  ['cleaning', 'cleaner|cleaning|sanitizer|sanitiser|soap|detergent|bleach|degreaser|mop|sponge|sponges|towel|towels|liner|liners|trash|gloves'],
  ['napkin', 'napkin|napkins'],
  ['straw', 'straw|straws'],
  ['cup', 'cup|cups'],
  ['bitters', 'bitters|angostura|peychauds'],
  ['syrup', 'syrup|syrups|grenadine|orgeat|agave nectar'],
  ['seltzer', 'seltzer|seltzers|white claw|truly|high noon'],
  ['mixer', 'mix|mixer|mixers|ginger beer|red bull|energy drink|margarita mix'],
  ['tonic', 'tonic'],
  ['soda', 'soda|cola|coke|coca cola|pepsi|sprite|ginger ale|root beer|lemonade|dr pepper'],
  ['juice', 'juice|juices|nectar'],
  ['cider', 'cider|ciders|angry orchard|strongbow'],
  ['beer-keg', 'keg|kegs|bbl|sixtel'],
  ['beer-can', 'can|cans|canned|tallboy|tallboys|16oz|16 oz'],
  ['draft-tap', 'draft|draught|on tap'],
  ['champagne', 'champagne|prosecco|cava|sparkling wine|brut|moet|veuve'],
  ['wine-white', 'white wine|chardonnay|sauvignon blanc|pinot grigio|pinot gris|riesling|moscato|rose'],
  ['wine-red', 'red wine|pinot|cabernet|merlot|malbec|zinfandel|syrah|shiraz|chianti|tempranillo'],
  ['liqueur', 'schnapps|kahlua|baileys|triple sec|cointreau|aperol|campari|jagermeister|vermouth|amaretto|chartreuse|curacao|st germain|fernet'],
  ['bourbon', 'bourbon|bulleit|makers mark|woodford|buffalo trace|jim beam|wild turkey'],
  ['whiskey', 'whiskey|whisky|scotch|rye|jameson|jack daniels|crown royal|fireball|johnnie walker|glenfiddich'],
  ['tequila', 'tequila|mezcal|casamigos|don julio|patron|espolon|jose cuervo'],
  ['vodka', 'vodka|tito|titos|grey goose|absolut|smirnoff|ketel one'],
  ['gin', 'gin|tanqueray|hendricks|bombay|beefeater'],
  ['rum', 'rum|bacardi|captain morgan|malibu'],
  ['brandy', 'brandy|cognac|armagnac|pisco|hennessy|remy martin'],
  ['beer-bottle', 'beer|lager|ipa|ale|stout|porter|pilsner|pils|modelo|corona|heineken|blue moon|guinness|budweiser|bud|miller|coors|michelob|pacifico|stella|yuengling'],
  ['wine-red', 'wine'],
  ['garnish', 'garnish|olive|olives|cherry|cherries|mint|celery|rimming salt|rim salt|cocktail onions'],
  ['citrus', 'citrus|lemon|lemons|lime|limes|orange|oranges|grapefruit|grapefruits'],
  ['ice', 'ice'],
  ['snack', 'snack|snacks|chips|peanuts|pretzels|popcorn|nuts|crackers|jerky'],
  ['food', 'food|wings|fries|pizza|burger|burgers|buns|bread|cheese|chicken|beef|nachos|tortillas|sauce'],
] as const;

export const PLACEHOLDER_ICONS = [...new Set([...RULES.map(([icon]) => icon), 'generic' as const])];
export type PlaceholderIcon = (typeof PLACEHOLDER_ICONS)[number];

// Only consulted when no word in the name says anything. Tested on the category's own words.
const BY_CATEGORY: [string, PlaceholderIcon][] = [
  ['wine', 'wine-red'], ['beer', 'beer-bottle'], ['mixer', 'mixer'], ['mixers', 'mixer'], ['food', 'food'],
];

/** Lower case, no accents or apostrophes, words separated and padded by single spaces. */
const words = (s: string) =>
  ` ${s.normalize('NFD').replace(/[̀-ͯ'’]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

const COMPILED = RULES.map(([icon, keys]) => [icon, new RegExp(` (?:${keys}) `)] as const);

export function placeholderIcon(name: string, category?: string | null): PlaceholderIcon {
  const n = words(name);
  const hit = COMPILED.find(([, re]) => re.test(n));
  if (hit) return hit[0];
  const c = words(category ?? '');
  return BY_CATEGORY.find(([word]) => c.includes(` ${word} `))?.[1] ?? 'generic';
}

export const placeholderSrc = (name: string, category?: string | null) =>
  `/inventory-placeholders/${placeholderIcon(name, category)}.svg`;
