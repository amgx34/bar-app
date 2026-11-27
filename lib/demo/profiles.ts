/**
 * The three bars one demo visitor belongs to. Pure data plus pure reshaping, so
 * "the bars are not copies" is a tested property rather than a hope.
 *
 * Each slug carries DEMO_SLUG_PREFIX: the purge sweeps by prefix and age, so a
 * bar without it would never be reclaimed.
 */
import { DEMO_SLUG_PREFIX } from './constants.ts';

export type DemoProfile = {
  key: string;
  name: string;
  address: string;
  city: string;
  state: string;
  barType: 'bar' | 'nightclub' | 'restaurant';
  /** Role the visitor holds here. */
  role: 'owner' | 'manager';
  /** Multiplies every night's sales and tips. */
  salesScale: number;
  /** Employees this bar does not have. Their shifts and server tips go too. */
  dropEmployees: string[];
  /** Inventory items this bar does not stock, by name. */
  dropItems: string[];
  /** Days-ago offsets this bar was closed. */
  closedOffsets: number[];
};

export const DEMO_PROFILES: DemoProfile[] = [
  {
    key: 'tavern', name: 'Demo Bar - The Tipsy Tavern', address: '123 Demo St, Chicago, IL',
    city: 'Chicago', state: 'IL', barType: 'bar', role: 'owner', salesScale: 1,
    dropEmployees: [], dropItems: [], closedOffsets: [],
  },
  {
    key: 'lounge', name: 'Demo Bar - Velvet Room Lounge', address: '48 Demo Ave, Austin, TX',
    city: 'Austin', state: 'TX', barType: 'nightclub', role: 'manager', salesScale: 1.9,
    dropEmployees: [],
    dropItems: ['Modelo Especial (case/24)', 'Corona Extra (case/24)', 'Guinness Draught Cans (case/24)', 'Bar Napkins (case)'],
    closedOffsets: [10, 4],
  },
  {
    key: 'corner', name: 'Demo Bar - Corner Pour', address: '9 Demo Row, Madison, WI',
    city: 'Madison', state: 'WI', barType: 'bar', role: 'owner', salesScale: 0.45,
    dropEmployees: ['Danny Rivera', 'Jordan Park', 'Mike Santos'],
    dropItems: [
      'Grey Goose Vodka 750ml', 'Casamigos Blanco Tequila 750ml', "Hendrick's Gin 750ml",
      'Whispering Angel Rosé 750ml', 'Meiomi Pinot Noir 750ml', 'Fever-Tree Club Soda (case/24)',
    ],
    closedOffsets: [11, 8, 1],
  },
];

export function profileSlug(p: DemoProfile, stamp: string): string {
  return `${DEMO_SLUG_PREFIX}${p.key}-${stamp}`;
}

type Night = {
  offset: number; sales: number; ccTips: number;
  servers: { name: string; sales: number; tips: number }[];
  shifts: { name: string }[];
};

const cents = (n: number) => Math.round(n * 100) / 100;

/** Reshapes the base nights for one bar. ccTips is re-summed so it still matches the server rows. */
export function shapeNights<N extends Night>(nights: N[], p: DemoProfile): N[] {
  const drop = new Set(p.dropEmployees);
  return nights
    .filter((n) => !p.closedOffsets.includes(n.offset))
    .map((n) => {
      const servers = n.servers
        .filter((s) => !drop.has(s.name))
        .map((s) => ({ ...s, sales: cents(s.sales * p.salesScale), tips: cents(s.tips * p.salesScale) }));
      return {
        ...n,
        servers,
        shifts: n.shifts.filter((s) => !drop.has(s.name)),
        sales: cents(servers.reduce((a, s) => a + s.sales, 0)) || cents(n.sales * p.salesScale),
        ccTips: cents(servers.reduce((a, s) => a + s.tips, 0)),
      };
    });
}
