/**
 * Static tables for the sample bars: inventory, categories, reps, employees,
 * 12 base nights (one server flagged at a 32% tip rate) and usage logs.
 * lib/demo/universal.ts turns them into dated rows.
 */

// ── Static seed tables ─────────────────────────────────────────────────────

// Classified from the start, so the demo shows a correct pour cost rather than
// one inflated by its own bar supplies.
export const CATEGORIES: { name: string; cost_type: string }[] = [
  { name: 'Spirits',                cost_type: 'beverage_cogs' },
  { name: 'Beer & Seltzers',        cost_type: 'beverage_cogs' },
  { name: 'Wine',                   cost_type: 'beverage_cogs' },
  { name: 'Mixers & Non-Alcoholic', cost_type: 'beverage_cogs' },
  { name: 'Supplies',               cost_type: 'supplies' },
];

export const REPS = [
  { name: 'Marcus Johnson', company: 'Southern Wine & Spirits',         phone: '+15555550101', email: 'marcus@sws-demo.com' },
  { name: 'Rachel Torres',  company: 'Republic National Distributing',  phone: '+15555550102', email: 'rachel@rnd-demo.com' },
  { name: 'Dave Kim',       company: 'Craft Brew Distributors',         phone: '+15555550103', email: 'dave@cbd-demo.com' },
];

export const EMPLOYEES_SEED = [
  // tip_mode: 'pool' shares the nightly pool by hours
  // Danny is 'individual' — his per-server tips are tracked directly (32% → flagged)
  { name: 'Wes Berns',    role: 'bartender', hourly_rate: 15.00, tip_mode: 'pool'       },
  { name: 'Kayla Chen',   role: 'bartender', hourly_rate: 15.00, tip_mode: 'pool'       },
  { name: 'Danny Rivera', role: 'bartender', hourly_rate: 15.00, tip_mode: 'individual' },
  { name: 'Alex Torres',  role: 'barback',   hourly_rate: 13.00, tip_mode: 'barback'    },
  { name: 'Jordan Park',  role: 'barback',   hourly_rate: 13.00, tip_mode: 'barback'    },
  { name: 'Mike Santos',  role: 'security',  hourly_rate: 14.00, tip_mode: 'no_tip'     },
  { name: 'Lisa Taylor',  role: 'manager',   hourly_rate: 18.00, tip_mode: 'no_tip'     },
];

export type ItemSeed = {
  name: string; category: string; unit: string;
  current_stock: number; par_level: number;
  cost_price: number | null; sale_price: number | null; sku: string | null;
  bottle_size_ml: number | null; pour_size_oz: number | null; rep_name: string;
};

export const ITEMS: ItemSeed[] = [
  // ── Spirits ──────────────────────────────────────────────────────────────
  { name: "Tito's Handmade Vodka 750ml",     category:'Spirits', unit:'bottle', current_stock:8,  par_level:12, cost_price:20.99, sale_price:null, sku:'TIT-750', bottle_size_ml:750,  pour_size_oz:1.5, rep_name:'Marcus Johnson' },
  { name:'Grey Goose Vodka 750ml',           category:'Spirits', unit:'bottle', current_stock:3,  par_level:6,  cost_price:29.99, sale_price:null, sku:'GG-750',  bottle_size_ml:750,  pour_size_oz:1.5, rep_name:'Marcus Johnson' },
  { name:'Absolut Vodka 1L',                 category:'Spirits', unit:'bottle', current_stock:5,  par_level:8,  cost_price:22.99, sale_price:null, sku:'ABS-1L',  bottle_size_ml:1000, pour_size_oz:1.5, rep_name:'Marcus Johnson' },
  { name:"Hendrick's Gin 750ml",             category:'Spirits', unit:'bottle', current_stock:4,  par_level:6,  cost_price:27.99, sale_price:null, sku:'HEN-750', bottle_size_ml:750,  pour_size_oz:1.5, rep_name:'Marcus Johnson' },
  { name:'Tanqueray Gin 1L',                 category:'Spirits', unit:'bottle', current_stock:2,  par_level:4,  cost_price:24.99, sale_price:null, sku:'TAN-1L',  bottle_size_ml:1000, pour_size_oz:1.5, rep_name:'Marcus Johnson' },
  { name:'Jameson Irish Whiskey 750ml',      category:'Spirits', unit:'bottle', current_stock:6,  par_level:8,  cost_price:26.99, sale_price:null, sku:'JAM-750', bottle_size_ml:750,  pour_size_oz:1.5, rep_name:'Rachel Torres'  },
  { name:"Jack Daniel's Tennessee Whiskey",  category:'Spirits', unit:'bottle', current_stock:9,  par_level:12, cost_price:24.99, sale_price:null, sku:'JD-750',  bottle_size_ml:750,  pour_size_oz:1.5, rep_name:'Rachel Torres'  },
  { name:'Bulleit Bourbon 750ml',            category:'Spirits', unit:'bottle', current_stock:3,  par_level:6,  cost_price:27.99, sale_price:null, sku:'BUL-750', bottle_size_ml:750,  pour_size_oz:1.5, rep_name:'Rachel Torres'  },
  { name:"Maker's Mark Bourbon 750ml",       category:'Spirits', unit:'bottle', current_stock:5,  par_level:8,  cost_price:26.99, sale_price:null, sku:'MAK-750', bottle_size_ml:750,  pour_size_oz:1.5, rep_name:'Rachel Torres'  },
  { name:'Don Julio Blanco Tequila 750ml',   category:'Spirits', unit:'bottle', current_stock:4,  par_level:6,  cost_price:44.99, sale_price:null, sku:'DJ-750',  bottle_size_ml:750,  pour_size_oz:1.5, rep_name:'Marcus Johnson' },
  { name:'Casamigos Blanco Tequila 750ml',   category:'Spirits', unit:'bottle', current_stock:1,  par_level:4,  cost_price:39.99, sale_price:null, sku:'CAS-750', bottle_size_ml:750,  pour_size_oz:1.5, rep_name:'Marcus Johnson' }, // LOW
  { name:'Bacardi Superior Rum 750ml',       category:'Spirits', unit:'bottle', current_stock:7,  par_level:8,  cost_price:14.99, sale_price:null, sku:'BAC-750', bottle_size_ml:750,  pour_size_oz:1.5, rep_name:'Rachel Torres'  },
  { name:'Captain Morgan Spiced Rum 750ml',  category:'Spirits', unit:'bottle', current_stock:4,  par_level:6,  cost_price:17.99, sale_price:null, sku:'CAP-750', bottle_size_ml:750,  pour_size_oz:1.5, rep_name:'Rachel Torres'  },
  // ── Beer ─────────────────────────────────────────────────────────────────
  { name:'Modelo Especial (case/24)',        category:'Beer & Seltzers', unit:'case', current_stock:5, par_level:8, cost_price:28.99, sale_price:null, sku:'MOD-24', bottle_size_ml:null, pour_size_oz:null, rep_name:'Dave Kim' },
  { name:'Corona Extra (case/24)',           category:'Beer & Seltzers', unit:'case', current_stock:3, par_level:6, cost_price:26.99, sale_price:null, sku:'COR-24', bottle_size_ml:null, pour_size_oz:null, rep_name:'Dave Kim' },
  { name:'Blue Moon Belgian White (case/24)',category:'Beer & Seltzers', unit:'case', current_stock:4, par_level:6, cost_price:30.99, sale_price:null, sku:'BLM-24', bottle_size_ml:null, pour_size_oz:null, rep_name:'Dave Kim' },
  { name:'Heineken (case/24)',               category:'Beer & Seltzers', unit:'case', current_stock:6, par_level:8, cost_price:29.99, sale_price:null, sku:'HEI-24', bottle_size_ml:null, pour_size_oz:null, rep_name:'Dave Kim' },
  { name:'White Claw Hard Seltzer Variety (case)', category:'Beer & Seltzers', unit:'case', current_stock:2, par_level:4, cost_price:27.99, sale_price:null, sku:'WCL-24', bottle_size_ml:null, pour_size_oz:null, rep_name:'Dave Kim' }, // LOW
  { name:'Guinness Draught Cans (case/24)', category:'Beer & Seltzers', unit:'case', current_stock:3, par_level:4, cost_price:32.99, sale_price:null, sku:'GUI-24', bottle_size_ml:null, pour_size_oz:null, rep_name:'Dave Kim' },
  // ── Wine ─────────────────────────────────────────────────────────────────
  { name:'Kim Crawford Sauvignon Blanc 750ml', category:'Wine', unit:'bottle', current_stock:6, par_level:8, cost_price:12.99, sale_price:null, sku:'KC-SB',  bottle_size_ml:750, pour_size_oz:null, rep_name:'Marcus Johnson' },
  { name:'Meiomi Pinot Noir 750ml',            category:'Wine', unit:'bottle', current_stock:4, par_level:6, cost_price:14.99, sale_price:null, sku:'MEI-PN', bottle_size_ml:750, pour_size_oz:null, rep_name:'Marcus Johnson' },
  { name:'Whispering Angel Rosé 750ml',        category:'Wine', unit:'bottle', current_stock:3, par_level:4, cost_price:18.99, sale_price:null, sku:'WA-ROS', bottle_size_ml:750, pour_size_oz:null, rep_name:'Marcus Johnson' },
  // ── Mixers ────────────────────────────────────────────────────────────────
  { name:'Fever-Tree Tonic Water (case/24)', category:'Mixers & Non-Alcoholic', unit:'case',  current_stock:4, par_level:6, cost_price:18.99, sale_price:null, sku:'FT-TON', bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' },
  { name:'Fever-Tree Club Soda (case/24)',   category:'Mixers & Non-Alcoholic', unit:'case',  current_stock:3, par_level:6, cost_price:16.99, sale_price:null, sku:'FT-CS',  bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' },
  { name:'House-Made Simple Syrup',          category:'Mixers & Non-Alcoholic', unit:'liter', current_stock:2, par_level:4, cost_price:2.50,  sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' },
  { name:'Fresh Lime Juice',                  category:'Mixers & Non-Alcoholic', unit:'liter', current_stock:0, par_level:3, cost_price:4.99,  sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' }, // OUT
  // ── Supplies ─────────────────────────────────────────────────────────────
  { name:'Cocktail Straws (box/500)',          category:'Supplies', unit:'box',  current_stock:4, par_level:6, cost_price:8.99,  sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' },
  { name:'Bar Napkins (case)',                  category:'Supplies', unit:'case', current_stock:3, par_level:5, cost_price:12.99, sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' },
  // ── More of the back bar ─────────────────────────────────────────────────
  { name:'Hennessy VS Cognac 750ml', category:'Spirits', unit:'bottle', current_stock:2, par_level:2, cost_price:34.99, sale_price:null, sku:null, bottle_size_ml:750, pour_size_oz:1.5, rep_name:'Marcus Johnson' },
  { name:'Kahlúa Coffee Liqueur 750ml', category:'Spirits', unit:'bottle', current_stock:3, par_level:3, cost_price:19.99, sale_price:null, sku:null, bottle_size_ml:750, pour_size_oz:1.5, rep_name:'Rachel Torres' },
  { name:'La Marca Prosecco 750ml', category:'Wine', unit:'bottle', current_stock:6, par_level:6, cost_price:12.49, sale_price:null, sku:null, bottle_size_ml:750, pour_size_oz:null, rep_name:'Marcus Johnson' },
  { name:'Lagunitas IPA Keg (1/2 bbl)', category:'Beer & Seltzers', unit:'keg', current_stock:2, par_level:2, cost_price:159.00, sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Dave Kim' },
  { name:'House Pilsner Draft', category:'Beer & Seltzers', unit:'keg', current_stock:2, par_level:2, cost_price:119.00, sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Dave Kim' },
  { name:'Angry Orchard Cider (case/24)', category:'Beer & Seltzers', unit:'case', current_stock:3, par_level:3, cost_price:31.49, sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Dave Kim' },
  { name:'Sour Mix', category:'Mixers & Non-Alcoholic', unit:'liter', current_stock:4, par_level:4, cost_price:3.49, sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' },
  { name:'Angostura Bitters', category:'Mixers & Non-Alcoholic', unit:'bottle', current_stock:3, par_level:3, cost_price:11.99, sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' },
  { name:'Cocktail Cherries (jar)', category:'Mixers & Non-Alcoholic', unit:'each', current_stock:4, par_level:4, cost_price:7.99, sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' },
  { name:'Fresh Limes (case)', category:'Mixers & Non-Alcoholic', unit:'case', current_stock:2, par_level:2, cost_price:24.00, sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' },
  { name:'Ice (20 lb bag)', category:'Supplies', unit:'each', current_stock:10, par_level:10, cost_price:3.50, sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' },
  { name:'Salted Peanuts (box)', category:'Supplies', unit:'box', current_stock:3, par_level:3, cost_price:16.00, sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' },
  { name:'Frozen Chicken Wings (case)', category:'Supplies', unit:'case', current_stock:2, par_level:2, cost_price:48.00, sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' },
  { name:'Plastic Cups 16oz (case)', category:'Supplies', unit:'case', current_stock:4, par_level:4, cost_price:38.00, sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' },
  { name:'Sanitizer Tablets (box)', category:'Supplies', unit:'box', current_stock:2, par_level:2, cost_price:14.50, sale_price:null, sku:null, bottle_size_ml:null, pour_size_oz:null, rep_name:'Rachel Torres' },
];

// ── Nightly data (12 nights over 2 weeks) ─────────────────────────────────
// ccTip totals exactly match the sum of server tips for data consistency.
// Danny Rivera at ~32% tip rate vs Wes/Kayla at 18% → triggers the flags feature.

type ServerEntry = { name: string; sales: number; tips: number };
type ShiftEntry  = { name: string; reg: number; ot: number };
export type NightConfig = {
  offset: number;      // days ago
  sales:  number;
  ccTips: number;
  servers: ServerEntry[];
  shifts:  ShiftEntry[];
};

export const NIGHTS: NightConfig[] = [
  // ── Week 1 ──────────────────────────────────────────────────────────────
  { offset:14, sales:2800, ccTips:504,
    servers:[{name:'Wes Berns',sales:1400,tips:252},{name:'Kayla Chen',sales:1400,tips:252}],
    shifts: [{name:'Wes Berns',reg:7.0,ot:0},{name:'Kayla Chen',reg:7.0,ot:0},{name:'Alex Torres',reg:6.0,ot:0},{name:'Mike Santos',reg:6.0,ot:0}] },

  { offset:13, sales:5200, ccTips:1076,   // Fri — Danny first appearance (32%)
    servers:[{name:'Wes Berns',sales:2200,tips:396},{name:'Kayla Chen',sales:2000,tips:360},{name:'Danny Rivera',sales:1000,tips:320}],
    shifts: [{name:'Wes Berns',reg:8.0,ot:0},{name:'Kayla Chen',reg:8.0,ot:0},{name:'Danny Rivera',reg:7.0,ot:0},{name:'Alex Torres',reg:7.5,ot:0},{name:'Jordan Park',reg:6.5,ot:0},{name:'Mike Santos',reg:8.0,ot:0}] },

  { offset:12, sales:6800, ccTips:1448,   // Sat — Danny 32%, best night W1
    servers:[{name:'Wes Berns',sales:2800,tips:504},{name:'Kayla Chen',sales:2400,tips:432},{name:'Danny Rivera',sales:1600,tips:512}],
    shifts: [{name:'Wes Berns',reg:8.0,ot:0.5},{name:'Kayla Chen',reg:8.0,ot:0.5},{name:'Danny Rivera',reg:8.0,ot:0},{name:'Alex Torres',reg:7.5,ot:0},{name:'Jordan Park',reg:7.0,ot:0},{name:'Mike Santos',reg:8.0,ot:0},{name:'Lisa Taylor',reg:8.0,ot:0}] },

  { offset:11, sales:2100, ccTips:378,    // Sun
    servers:[{name:'Wes Berns',sales:1050,tips:189},{name:'Kayla Chen',sales:1050,tips:189}],
    shifts: [{name:'Wes Berns',reg:7.0,ot:0},{name:'Kayla Chen',reg:7.0,ot:0},{name:'Alex Torres',reg:6.0,ot:0},{name:'Mike Santos',reg:5.0,ot:0}] },

  { offset:10, sales:1800, ccTips:324,    // Mon
    servers:[{name:'Wes Berns',sales:900,tips:162},{name:'Kayla Chen',sales:900,tips:162}],
    shifts: [{name:'Wes Berns',reg:7.0,ot:0},{name:'Kayla Chen',reg:7.0,ot:0}] },

  // offset:9 = Tue — CLOSED (no data)

  { offset:8, sales:1500, ccTips:270,     // Wed
    servers:[{name:'Wes Berns',sales:750,tips:135},{name:'Kayla Chen',sales:750,tips:135}],
    shifts: [{name:'Wes Berns',reg:7.0,ot:0},{name:'Kayla Chen',reg:7.0,ot:0}] },

  // ── Week 2 ──────────────────────────────────────────────────────────────
  { offset:7, sales:3100, ccTips:558,     // Thu — slightly up from last Thu
    servers:[{name:'Wes Berns',sales:1550,tips:279},{name:'Kayla Chen',sales:1550,tips:279}],
    shifts: [{name:'Wes Berns',reg:7.5,ot:0},{name:'Kayla Chen',reg:7.5,ot:0},{name:'Alex Torres',reg:6.5,ot:0},{name:'Mike Santos',reg:6.0,ot:0}] },

  { offset:6, sales:5800, ccTips:1212,    // Fri — Danny 32%
    servers:[{name:'Wes Berns',sales:2400,tips:432},{name:'Kayla Chen',sales:2200,tips:396},{name:'Danny Rivera',sales:1200,tips:384}],
    shifts: [{name:'Wes Berns',reg:8.0,ot:0},{name:'Kayla Chen',reg:8.0,ot:0},{name:'Danny Rivera',reg:7.5,ot:0},{name:'Alex Torres',reg:7.5,ot:0},{name:'Jordan Park',reg:7.0,ot:0},{name:'Mike Santos',reg:8.0,ot:0}] },

  { offset:5, sales:7400, ccTips:1584,    // Sat — best night overall, Danny 32%
    servers:[{name:'Wes Berns',sales:3000,tips:540},{name:'Kayla Chen',sales:2600,tips:468},{name:'Danny Rivera',sales:1800,tips:576}],
    shifts: [{name:'Wes Berns',reg:8.0,ot:1.0},{name:'Kayla Chen',reg:8.0,ot:0.5},{name:'Danny Rivera',reg:8.0,ot:0},{name:'Alex Torres',reg:8.0,ot:0},{name:'Jordan Park',reg:7.5,ot:0},{name:'Mike Santos',reg:8.0,ot:0},{name:'Lisa Taylor',reg:8.0,ot:0}] },

  { offset:4, sales:2300, ccTips:414,     // Sun
    servers:[{name:'Wes Berns',sales:1150,tips:207},{name:'Kayla Chen',sales:1150,tips:207}],
    shifts: [{name:'Wes Berns',reg:7.0,ot:0},{name:'Kayla Chen',reg:7.0,ot:0},{name:'Alex Torres',reg:6.0,ot:0},{name:'Mike Santos',reg:5.0,ot:0}] },

  { offset:3, sales:1950, ccTips:351,     // Mon
    servers:[{name:'Wes Berns',sales:975,tips:175.50},{name:'Kayla Chen',sales:975,tips:175.50}],
    shifts: [{name:'Wes Berns',reg:7.0,ot:0},{name:'Kayla Chen',reg:7.0,ot:0}] },

  // offset:2 = Tue — CLOSED (no data)

  { offset:1, sales:1650, ccTips:297,     // Wed (yesterday)
    servers:[{name:'Wes Berns',sales:825,tips:148.50},{name:'Kayla Chen',sales:825,tips:148.50}],
    shifts: [{name:'Wes Berns',reg:7.0,ot:0},{name:'Kayla Chen',reg:7.0,ot:0}] },
];

// ── Usage logs — deliveries + loss report ─────────────────────────────────

export type LogSeed = { item: string; qty: number; reason: string; note: string };

export const USAGE_LOGS: LogSeed[] = [
  // ── Deliveries (incoming stock) ──────────────────────────────────────────
  { item:"Tito's Handmade Vodka 750ml",    qty:6,   reason:'delivery',    note:'Mon delivery — Southern Wine & Spirits — PO #SW-2847' },
  { item:"Jack Daniel's Tennessee Whiskey",qty:4,   reason:'delivery',    note:'Tue delivery — Republic National — PO #RN-1103' },
  { item:'Jameson Irish Whiskey 750ml',     qty:3,   reason:'delivery',    note:'Tue delivery — Republic National — PO #RN-1103' },
  { item:'Bulleit Bourbon 750ml',           qty:3,   reason:'delivery',    note:'Tue delivery — Republic National — PO #RN-1103' },
  { item:'Modelo Especial (case/24)',        qty:3,   reason:'delivery',    note:'Mon delivery — Craft Brew Distributors' },
  { item:'Corona Extra (case/24)',           qty:2,   reason:'delivery',    note:'Mon delivery — Craft Brew Distributors' },
  { item:'Heineken (case/24)',               qty:2,   reason:'delivery',    note:'Mon delivery — Craft Brew Distributors' },
  { item:'Fever-Tree Tonic Water (case/24)', qty:2,  reason:'delivery',    note:'Wed misc delivery' },
  { item:'Fever-Tree Club Soda (case/24)',   qty:2,  reason:'delivery',    note:'Wed misc delivery' },
  { item:'Cocktail Straws (box/500)',         qty:2,  reason:'delivery',    note:'Wed misc delivery — resupply' },

  // ── Spillage / breakage (loss events) ───────────────────────────────────
  { item:'Grey Goose Vodka 750ml',           qty:1,   reason:'spillage',    note:'Bottle knocked off back-bar shelf during Sat rush — shattered (full bottle loss, $29.99)' },
  { item:"Tito's Handmade Vodka 750ml",     qty:0.2, reason:'spillage',    note:'Bar mat overflow during closing cleanup — approx 3 oz lost' },
  { item:'Bulleit Bourbon 750ml',            qty:0.3, reason:'spillage',    note:'Overpouring documented by manager during busy Fri night — approx 4.5 oz over-served' },
  { item:'Fresh Lime Juice',                 qty:1,   reason:'spillage',    note:'Full 1L container dropped during afternoon prep — complete loss' },
  { item:'Absolut Vodka 1L',                 qty:0.15,reason:'spillage',    note:'Cocktail shaker exploded — ~2.25 oz lost (customer was fine, offered replacement)' },

  // ── Comps (guest recovery & VIP service) ────────────────────────────────
  { item:'Don Julio Blanco Tequila 750ml',   qty:0.2, reason:'comp',        note:'Round comped for extended wait — 4 guests — Mgr auth. Lisa T. — Sat night table 7' },
  { item:'Bacardi Superior Rum 750ml',       qty:0.2, reason:'comp',        note:'Comped 4 rum & cokes — off-taste complaint — Sun night — replaced immediately' },
  { item:'Modelo Especial (case/24)',         qty:0.17,reason:'comp',        note:'4 beers comped for VIP birthday reservation — pre-approved by owner' },
  { item:'Kim Crawford Sauvignon Blanc 750ml',qty:0.33,reason:'comp',       note:'Bottle comped for 2-top anniversary table — Wes B. authorization' },
  { item:"Hendrick's Gin 750ml",             qty:0.1, reason:'comp',        note:"Negroni comped — guest's complaint about wait during Fri rush" },

  // ── Staff drinks (per house policy: 1 shift drink per closer) ────────────
  { item:'Jameson Irish Whiskey 750ml',      qty:0.1, reason:'staff_drink', note:'Wes B. — Sat close (1 shift drink, house policy — 1.5 oz)' },
  { item:"Tito's Handmade Vodka 750ml",     qty:0.1, reason:'staff_drink', note:'Kayla C. — Fri close (1 shift drink, house policy — 1.5 oz)' },
  { item:'Bacardi Superior Rum 750ml',       qty:0.1, reason:'staff_drink', note:'Danny R. — Sat close (1 shift drink, house policy — 1.5 oz)' },
  { item:"Maker's Mark Bourbon 750ml",       qty:0.1, reason:'staff_drink', note:'Alex T. — Sat close barback shift drink (1.5 oz)' },

  // ── Recount corrections (inventory discrepancies) ────────────────────────
  { item:'Casamigos Blanco Tequila 750ml',   qty:3,   reason:'recount',     note:'Thu recount — expected 4 bottles on hand, physical count shows 1. -3 unaccounted for over past 2 weeks. Flagged for investigation — likely undocumented comps or spillage.' },
  { item:"Hendrick's Gin 750ml",             qty:1,   reason:'recount',     note:'Weekly recount — 1 bottle short vs expected from last delivery. Possible vendor shortfall — notified Marcus Johnson (SWS). PO #SW-2847 claim filed.' },
  { item:'White Claw Hard Seltzer Variety (case)',qty:0.5,reason:'recount', note:'Recount — 12 cans unaccounted for vs stocking records. Likely consumed without proper log during Sunday event. Staff reminded to log all consumption.' },
];
