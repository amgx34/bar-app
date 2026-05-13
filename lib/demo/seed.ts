/**
 * Comprehensive demo org seed — populates every Rail feature:
 *   inventory · categories · reps · employees · Z reports (12 nights) ·
 *   per-server tip data (Danny Rivera flagged at 32%) · employee shifts ·
 *   usage logs (deliveries, spillage, comps, staff drinks, recounts)
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// ── Static seed tables ─────────────────────────────────────────────────────

const CATEGORIES = [
  'Spirits', 'Beer & Seltzers', 'Wine', 'Mixers & Non-Alcoholic', 'Supplies',
];

const REPS = [
  { name: 'Marcus Johnson', company: 'Southern Wine & Spirits',         phone: '+15555550101', email: 'marcus@sws-demo.com' },
  { name: 'Rachel Torres',  company: 'Republic National Distributing',  phone: '+15555550102', email: 'rachel@rnd-demo.com' },
  { name: 'Dave Kim',       company: 'Craft Brew Distributors',         phone: '+15555550103', email: 'dave@cbd-demo.com' },
];

const EMPLOYEES_SEED = [
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

type ItemSeed = {
  name: string; category: string; unit: string;
  current_stock: number; par_level: number;
  cost_price: number | null; sale_price: number | null; sku: string | null;
  bottle_size_ml: number | null; pour_size_oz: number | null; rep_name: string;
};

const ITEMS: ItemSeed[] = [
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
];

// ── Nightly data (12 nights over 2 weeks) ─────────────────────────────────
// ccTip totals exactly match the sum of server tips for data consistency.
// Danny Rivera at ~32% tip rate vs Wes/Kayla at 18% → triggers the flags feature.

type ServerEntry = { name: string; sales: number; tips: number };
type ShiftEntry  = { name: string; reg: number; ot: number };
type NightConfig = {
  offset: number;      // days ago
  sales:  number;
  ccTips: number;
  servers: ServerEntry[];
  shifts:  ShiftEntry[];
};

const NIGHTS: NightConfig[] = [
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

type LogSeed = { item: string; qty: number; reason: string; note: string };

const USAGE_LOGS: LogSeed[] = [
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

// ── Helper ─────────────────────────────────────────────────────────────────

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

// ── Main export ────────────────────────────────────────────────────────────

export async function seedDemoOrg(admin: SupabaseClient, userId: string): Promise<string> {

  // ── 1. Organization ──────────────────────────────────────────────────────
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name: 'Demo Bar — The Tipsy Tavern',
      slug: `demo-tipsy-tavern-${Date.now().toString(36)}`,
      bar_type: 'bar',
      bar_address: '123 Demo St, Chicago, IL',
      bar_settings: {
        tip_split_percent:    18,
        barback_tip_pct:      15,
        default_hourly_rate:  15,
        default_pour_oz:      1.5,
        opener_bonus_type:    'fixed',
        opener_bonus_value:   25,
        bar_type: 'bar', bar_city: 'Chicago', bar_state: 'IL',
        hourly_rates: { bartender: 15, barback: 13, manager: 18, server: 13, security: 14, other: 13 },
        auto_reorder_enabled: true,
        bottle_sizes_ml: [375, 750, 1000, 1750],
        _is_demo: true,
      },
    })
    .select('id').single();
  if (orgErr || !org) throw new Error('Demo org creation failed');
  const orgId = org.id as string;

  // ── 2. Membership ────────────────────────────────────────────────────────
  await admin.from('memberships').insert({ user_id: userId, organization_id: orgId, role: 'owner' });

  // ── 3. Categories ────────────────────────────────────────────────────────
  const { data: catRows } = await admin
    .from('inventory_categories')
    .insert(CATEGORIES.map(name => ({ organization_id: orgId, name })))
    .select('id, name');
  const catMap = new Map((catRows ?? []).map(c => [c.name as string, c.id as string]));

  // ── 4. Reps ──────────────────────────────────────────────────────────────
  const { data: repRows } = await admin
    .from('reps')
    .insert(REPS.map(r => ({ ...r, organization_id: orgId })))
    .select('id, name');
  const repMap = new Map((repRows ?? []).map(r => [r.name as string, r.id as string]));

  // ── 5. Inventory items ───────────────────────────────────────────────────
  const { data: itemRows } = await admin
    .from('inventory_items')
    .insert(ITEMS.map(i => ({
      organization_id: orgId,
      name: i.name, category_id: catMap.get(i.category) ?? null,
      rep_id: repMap.get(i.rep_name) ?? null, unit: i.unit,
      current_stock: i.current_stock, par_level: i.par_level,
      cost_price: i.cost_price, sale_price: i.sale_price,
      sku: i.sku, bottle_size_ml: i.bottle_size_ml, pour_size_oz: i.pour_size_oz,
    })))
    .select('id, name');
  const itemByName = new Map((itemRows ?? []).map(r => [r.name as string, r.id as string]));

  // ── 6. Employees ─────────────────────────────────────────────────────────
  const { data: empRows } = await admin
    .from('employees')
    .insert(EMPLOYEES_SEED.map(e => ({ ...e, organization_id: orgId })))
    .select('id, name');
  const empByName = new Map((empRows ?? []).map(e => [e.name as string, e.id as string]));

  // ── 7. Z report days + per-server tips + employee shifts ─────────────────
  for (const night of NIGHTS) {
    const reportDate = dateStr(night.offset);

    // z_report_days
    await admin.from('z_report_days').upsert({
      organization_id: orgId,
      report_date: reportDate,
      total_sales: night.sales,
      cash_tips: 0,
      cc_tips: night.ccTips,
    }, { onConflict: 'organization_id,report_date' });

    // z_report_server_tips
    if (night.servers.length > 0) {
      const tipRows = night.servers.map(s => ({
        organization_id: orgId,
        report_date:     reportDate,
        employee_name:   s.name,
        total_sales:     s.sales,
        tips_paid_out:   s.tips,
      }));
      // Clear then insert (safe re-seed)
      await admin.from('z_report_server_tips').delete()
        .eq('organization_id', orgId).eq('report_date', reportDate);
      await admin.from('z_report_server_tips').insert(tipRows);
    }

    // employee_shifts
    const shiftRows = night.shifts
      .filter(s => empByName.has(s.name))
      .map(s => ({
        organization_id: orgId,
        employee_id:     empByName.get(s.name),
        shift_date:      reportDate,
        regular_hours:   s.reg,
        overtime_hours:  s.ot,
        hourly_rate:     null, // use employee's default rate
      }));
    if (shiftRows.length > 0) {
      await admin.from('employee_shifts').delete()
        .eq('organization_id', orgId).eq('shift_date', reportDate);
      await admin.from('employee_shifts').insert(shiftRows);
    }
  }

  // ── 8. Usage logs (deliveries, spillage, comps, staff drinks, recounts) ──
  const logInserts = USAGE_LOGS
    .filter(l => itemByName.has(l.item))
    .map(l => ({
      organization_id: orgId,
      item_id:  itemByName.get(l.item),
      quantity: l.qty,
      reason:   l.reason,
      note:     l.note,
    }));
  if (logInserts.length > 0) await admin.from('usage_logs').insert(logInserts);

  return orgId;
}
