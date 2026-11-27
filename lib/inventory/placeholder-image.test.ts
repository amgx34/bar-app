import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PLACEHOLDER_ICONS, placeholderIcon, placeholderSrc } from './placeholder-image';

const CASES: [name: string, category: string | null, icon: string][] = [
  ["Tito's Handmade Vodka 750ml", null, 'vodka'],
  ['TITO’S 1L', null, 'vodka'],
  ['Jameson 750ml', null, 'whiskey'],
  ["Jack Daniel's Tennessee Whiskey", null, 'whiskey'],
  ["Maker's Mark Bourbon Whisky", null, 'bourbon'],
  ['Don Julio Blanco 750ml', null, 'tequila'],
  ['Captain Morgan Spiced Rum', null, 'rum'],
  ["Hendrick's Gin", null, 'gin'],
  ['Hennessy VS Cognac', null, 'brandy'],
  ['Kahlúa Coffee Liqueur', null, 'liqueur'],
  ['Luxardo Maraschino Liqueur', null, 'liqueur'],
  ["Pimm's No. 1 Cup", null, 'liqueur'],
  ['Meiomi Pinot Noir', null, 'wine-red'],
  ['Josh Cabernet Sauvignon', null, 'wine-red'],
  ['Santa Margherita Pinot Grigio', null, 'wine-white'],
  ['Kim Crawford Sauvignon Blanc', null, 'wine-white'],
  ['Whispering Angel Rosé', null, 'wine-white'],
  ['La Marca Prosecco', null, 'champagne'],
  ['Modelo Especial (case/24)', null, 'beer-bottle'],
  ['Blue Moon Belgian White (case/24)', null, 'beer-bottle'],
  ['House Lager', null, 'beer-bottle'],
  ['Hazy IPA', null, 'beer-bottle'],
  ['Guinness Draught Cans (case/24)', null, 'beer-can'],
  ['Pabst 16oz', null, 'beer-can'],
  ['Hazy IPA 1/2 Keg', null, 'beer-keg'],
  ['Pilsner Draft', null, 'draft-tap'],
  ['Angry Orchard Cider', null, 'cider'],
  ['White Claw Hard Seltzer Variety (case)', null, 'seltzer'],
  ['High Noon Vodka Soda Cans', null, 'seltzer'],
  ['Sour Mix', null, 'mixer'],
  ['Red Bull 8oz can', null, 'mixer'],
  ['Ginger Beer', null, 'mixer'],
  ['Fever-Tree Club Soda (case/24)', null, 'soda'],
  ['Coke 12oz can', null, 'soda'],
  ['Lemon-Lime Soda', null, 'soda'],
  ['Fever-Tree Tonic Water', null, 'tonic'],
  ['Fresh Lime Juice', null, 'juice'],
  ['House-Made Simple Syrup', null, 'syrup'],
  ['Angostura Bitters', null, 'bitters'],
  ['Cocktail Cherries', null, 'garnish'],
  ['Fresh Limes', null, 'citrus'],
  ['Cherry Vodka', null, 'vodka'],
  ['Bud Light Lime', null, 'beer-bottle'],
  ['Ice (20 lb bag)', null, 'ice'],
  ['Salted Peanuts', null, 'snack'],
  ['Chicken Wings', null, 'food'],
  ['Bar Napkins (case)', null, 'napkin'],
  ['16oz Plastic Cups', null, 'cup'],
  ['Cocktail Straws (box/500)', null, 'straw'],
  ['Strawberry Puree', null, 'generic'],
  ['Sanitizer Tablets', null, 'cleaning'],
  ['Trash Can Liners', null, 'cleaning'],
  // whole words only
  ['Ginger Shortbread', null, 'generic'],
  ['Pineapple Candle', null, 'generic'],
  // the name wins over the category; the category only breaks a total miss
  ['Titos', 'Wine', 'vodka'],
  ['House Red', 'Wine', 'wine-red'],
  ['Local Rotator', 'Beer & Seltzers', 'beer-bottle'],
  ['House Blend', 'Mixers & Non-Alcoholic', 'mixer'],
  ['Mystery Thing', 'Supplies', 'generic'],
  ['', null, 'generic'],
];

describe('placeholderIcon', () => {
  it.each(CASES)('%s (%s) -> %s', (name, category, icon) => {
    expect(placeholderIcon(name, category)).toBe(icon);
  });
  it('builds a static path', () => {
    expect(placeholderSrc('Rum')).toBe('/inventory-placeholders/rum.svg');
  });
});

describe('icon files', () => {
  const dir = 'public/inventory-placeholders';
  it('has exactly one file per icon', () => {
    expect(readdirSync(dir).sort()).toEqual(PLACEHOLDER_ICONS.map((i) => `${i}.svg`).sort());
  });
  it.each([...PLACEHOLDER_ICONS])('%s is small, square, one colour, flat, transparent', (icon) => {
    const svg = readFileSync(`${dir}/${icon}.svg`, 'utf8');
    expect(Buffer.byteLength(svg)).toBeLessThan(2048);
    const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
    expect(w).toBe(h);
    expect(new Set(svg.match(/#[0-9a-f]{3,8}\b/gi)).size).toBe(1);
    expect(svg).not.toMatch(/gradient|<rect[^>]*width="(24|100%)"[^>]*height="(24|100%)"/i);
  });
});
