/**
 * The permanent, read-only sample bars. Pure builders only: given a bar and a
 * clock they return every row the seed will write, so "dates are relative to
 * today" and "the books add up" are tested properties. No database in here.
 *
 * Two clocks stay separate on purpose (see AGENTS.md): a shipment's
 * invoice_date is the date on the paper, usage_logs.logged_at is when someone
 * typed it in. The lines link to the shipment by id, never by date.
 */
import { DEMO_PROFILES, shapeNights, type DemoProfile } from './profiles.ts';
import {
  CATEGORIES, REPS, EMPLOYEES_SEED, ITEMS, NIGHTS, USAGE_LOGS, type ItemSeed,
} from './seed.ts';

export const UNIVERSAL_SLUG_PREFIX = 'rail-demo-';
export const UNIVERSAL_EMAIL = 'shared-visitor@demo.example';
export const universalSlug = (key: string) => `${UNIVERSAL_SLUG_PREFIX}${key}`;

// All three sample bars are in the Central time zone (IL, TX, WI).
const TZ = 'America/Chicago';

// ── Dates ──────────────────────────────────────────────────────────────────

/** Today's calendar date in the bar's own time zone, as YYYY-MM-DD. */
export function localDate(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const dow = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Splits a total into parts that add back to it exactly; the leftover cents go to the biggest part. */
export function splitByWeights(total: number, weights: number[]): number[] {
  const cents = Math.round(total * 100);
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.floor((cents * w) / sum));
  const big = weights.indexOf(Math.max(...weights));
  parts[big] += cents - parts.reduce((a, b) => a + b, 0);
  return parts.map((c) => c / 100);
}

// ── Safety ─────────────────────────────────────────────────────────────────

const host = (u?: string) => {
  try { return u ? new URL(u).hostname.toLowerCase() : ''; } catch { return ''; }
};

/** The seed writes to a database, so it refuses anything but the dev project unless told otherwise. */
export function assertSeedTarget(target: string | undefined, dev: string | undefined, live: string | undefined, allowRemote: boolean): void {
  const t = host(target);
  if (!t) throw new Error('No Supabase URL is set, so there is nothing to seed.');
  if (allowRemote) return;
  if (!host(dev)) throw new Error('No dev project is configured (.env.development.local), so the seed will not run.');
  if (live && t === host(live)) throw new Error('This points at the live project. Refusing. Pass --allow-remote only if the owner asked for exactly this.');
  if (t !== host(dev)) throw new Error('This is not the dev project. Refusing. Pass --allow-remote only if the owner asked for exactly this.');
}

// ── Nights ─────────────────────────────────────────────────────────────────

// The weekday each base night in seed.ts stands for (its comments say Fri, Sat...).
const BASE_DOW: Record<number, number> = { 14: 4, 13: 5, 12: 6, 11: 0, 10: 1, 8: 3, 7: 4, 6: 5, 5: 6, 4: 0, 3: 1, 1: 3 };
const HOUR_WEIGHTS = [0.03, 0.05, 0.08, 0.12, 0.17, 0.22, 0.19, 0.09, 0.05];
const HOURS = [17, 18, 19, 20, 21, 22, 23, 0, 1];

export type Night = {
  date: string; offset: number; sales: number; ccTips: number;
  cashSales: number; cardSales: number; cashTips: number; cashTipsSource: 'manual' | null;
  servers: { name: string; sales: number; tips: number }[];
  shifts: { name: string; reg: number; ot: number }[];
};

/** Fourteen nights ending yesterday. A date takes the base night for its weekday, so a Saturday is always busy and Tuesday always closed. */
function baseNights(today: string) {
  const out = [];
  for (let offset = 14; offset >= 1; offset--) {
    const date = addDays(today, -offset);
    const same = NIGHTS.filter((n) => BASE_DOW[n.offset] === dow(date));
    if (!same.length) continue;
    out.push({ ...same[Math.floor(offset / 7) % same.length], offset, date });
  }
  return out;
}

// ── The plan for one bar ───────────────────────────────────────────────────

export type BarPlan = ReturnType<typeof buildBar>;

const healthy = (i: ItemSeed) => i.par_level;
// Names get their stock set by hand so each bar tells a different story.
const STOCK_BY_BAR: Record<string, Record<string, number>> = {
  tavern: { 'Casamigos Blanco Tequila 750ml': 1, 'White Claw Hard Seltzer Variety (case)': 2, 'Grey Goose Vodka 750ml': 3, 'Fresh Lime Juice': 0, 'Heineken (case/24)': 11 },
  lounge: { 'Casamigos Blanco Tequila 750ml': 2, 'Fresh Lime Juice': 1, 'Heineken (case/24)': 13, 'Don Julio Blanco Tequila 750ml': 8 },
  corner: { 'Fresh Lime Juice': 0 },
};

function itemsFor(p: DemoProfile) {
  const drop = new Set(p.dropItems);
  const overrides = STOCK_BY_BAR[p.key] ?? {};
  return ITEMS.filter((i) => !drop.has(i.name)).map((i, idx) => ({
    ...i,
    // The small bar runs thin: every second item sits at half of par.
    current_stock: overrides[i.name] ?? (p.key === 'corner' && i.category !== 'Supplies' && idx % 2 === 0 ? Math.floor(i.par_level / 2) : healthy(i)),
  }));
}

const VENDOR_FOR = (rep: string) => REPS.find((r) => r.name === rep)?.company ?? rep;

export function buildBar(p: DemoProfile, now: Date) {
  const tz = TZ;
  const today = localDate(now, tz);
  const shaped = shapeNights(baseNights(today), p);
  const last = shaped.length - 1;
  const nights: Night[] = shaped.map((n, i) => {
    const cashSales = r2(n.sales * 0.34);
    const manual = i === last;
    return {
      date: n.date, offset: n.offset, sales: n.sales, ccTips: n.ccTips,
      cashSales, cardSales: r2(n.sales - cashSales),
      cashTips: manual ? r2(n.sales * 0.012) : 0, cashTipsSource: manual ? 'manual' : null,
      servers: n.servers, shifts: n.shifts,
    };
  });

  const drop = new Set(p.dropEmployees);
  const employees = EMPLOYEES_SEED.filter((e) => !drop.has(e.name)).map((e) => ({
    ...e,
    tax_classification: e.name === 'Mike Santos' ? 'contractor_1099' : 'w2',
    w4_filing_status: e.name === 'Mike Santos' ? null : e.name === 'Lisa Taylor' ? 'married_jointly' : 'single',
  }));
  const rateOf = new Map(employees.map((e) => [e.name, e.hourly_rate]));
  const roleOf = new Map(employees.map((e) => [e.name, e.role]));

  const shifts = nights.flatMap((n) => n.shifts.filter((s) => rateOf.has(s.name))
    .map((s) => ({ employee: s.name, date: n.date, regular_hours: s.reg, overtime_hours: s.ot })));

  const hourly = nights.flatMap((n) => {
    const net = splitByWeights(n.sales, HOUR_WEIGHTS);
    const tips = splitByWeights(n.ccTips, HOUR_WEIGHTS);
    return HOURS.map((hour, i) => ({ business_date: n.date, hour, net_sales: net[i], ticket_count: Math.max(1, Math.round(net[i] / 30)), tips: tips[i] }));
  });
  const serverSales = nights.flatMap((n) => n.servers.map((s) => ({
    business_date: n.date, server_name: s.name, net_sales: s.sales, ticket_count: Math.max(1, Math.round(s.sales / 30)), tips: s.tips,
  })));

  const items = itemsFor(p);
  const have = new Set(items.map((i) => i.name));
  const at = (daysAgo: number, hour = 18) => `${addDays(today, -daysAgo)}T${String(hour).padStart(2, '0')}:00:00Z`;

  // Spread the hand-written movements over the last ten days, newest first.
  const movements = USAGE_LOGS.filter((l) => have.has(l.item))
    .map((l, i) => ({ item: l.item, quantity: l.qty, reason: l.reason, note: l.note, logged_at: at(1 + (i % 10)), shipment: false }));
  // Sales deplete stock in stock units, one row per busy night for the first five spirits.
  const posSales = nights.slice(-7).flatMap((n) => items.filter((i) => i.category === 'Spirits').slice(0, 5)
    .map((i, k) => ({ item: i.name, quantity: r2((n.sales / 1000) * (0.9 - k * 0.12)), reason: 'pos_sale', note: 'Sold through the POS', logged_at: `${n.date}T23:59:00Z`, shipment: false })));

  // A delivery invoice dated five days back, entered two days later. Not joined on date.
  const lines = {
    tavern: [["Tito's Handmade Vodka 750ml", 6], ["Jack Daniel's Tennessee Whiskey", 4], ['Modelo Especial (case/24)', 3], ['Fever-Tree Tonic Water (case/24)', 2]],
    lounge: [["Tito's Handmade Vodka 750ml", 12], ['Jameson Irish Whiskey 750ml', 8], ['Bulleit Bourbon 750ml', 6], ['Heineken (case/24)', 5]],
  }[p.key as 'tavern' | 'lounge'] as [string, number][] | undefined;
  const shipment = lines && lines.every(([n]) => have.has(n)) ? (() => {
    const priced = lines.map(([name, quantity]) => {
      const it = items.find((i) => i.name === name)!;
      return { item: name, quantity, unit_cost: r2((it.cost_price ?? 10) - 0.5) };
    });
    const freight = p.key === 'lounge' ? 42 : 18;
    const tax = p.key === 'lounge' ? 36.4 : 0;
    const goods = priced.reduce((a, l) => a + l.quantity * l.unit_cost, 0);
    const rep = items.find((i) => i.name === lines[0][0])!.rep_name;
    return {
      vendor_name: VENDOR_FOR(rep), rep_name: rep, invoice_number: `INV-${p.key === 'lounge' ? '55120' : '48307'}`,
      invoice_date: addDays(today, -5), received_date: addDays(today, -4), logged_at: at(3),
      freight, tax, invoice_total: r2(goods + freight + tax), lines: priced,
    };
  })() : null;

  // Pay runs: tavern's last week is waiting on the owner, lounge's week before was approved.
  const period = p.key === 'tavern' ? { start: addDays(today, -7), end: addDays(today, -1) }
    : p.key === 'lounge' ? { start: addDays(today, -14), end: addDays(today, -8) } : null;
  const payrollRun = period ? (() => {
    const mult = 1.5;
    const inRange = shifts.filter((s) => s.date >= period.start && s.date <= period.end);
    const names = [...new Set(inRange.map((s) => s.employee))];
    const snapshot = names.map((name) => {
      const mine = inRange.filter((s) => s.employee === name);
      const reg = r2(mine.reduce((a, s) => a + s.regular_hours, 0));
      const ot = r2(mine.reduce((a, s) => a + s.overtime_hours, 0));
      const rate = rateOf.get(name)!;
      const regularPay = r2(reg * rate);
      const overtimePay = r2(ot * rate * mult);
      return {
        employeeName: name, totalHours: r2(reg + ot), totalCompensation: r2(regularPay + overtimePay),
        breakdown: { role: roleOf.get(name) ?? null, regularHours: reg, overtimeHours: ot, hourlyRate: rate, regularPay, overtimePay, tipAmount: 0, tipsPerHour: 0, effectiveHourlyRate: rate, payType: 'percentage' },
      };
    });
    return { status: p.key === 'tavern' ? 'pending_approval' : 'approved', period_start: period.start, period_end: period.end, snapshot };
  })() : null;

  const adjustment = p.key === 'tavern' && shifts.length
    ? { shift_date: shifts.find((s) => s.employee === 'Wes Berns')?.date ?? shifts[0].date, employee: 'Wes Berns', hours_before: 7, hours_after: 7.5, reason: 'Stayed to close out the register' }
    : null;
  const payout = payrollRun?.status === 'approved' && payrollRun.snapshot[0]
    ? { employee: payrollRun.snapshot[0].employeeName, period_start: payrollRun.period_start, period_end: payrollRun.period_end, method: 'cash', amount_paid: r2(payrollRun.snapshot[0].totalCompensation / 2), paid_at: at(4) }
    : null;

  const reps = REPS.map((r) => ({ ...r }));
  const stocked = items.filter((i) => i.rep_name === 'Marcus Johnson' && i.current_stock < i.par_level).slice(0, 3);
  const orderItems = (list: typeof stocked) => list.map((i) => ({ name: i.name, quantity: Math.max(1, i.par_level - i.current_stock), unit: i.unit }));
  const repOrders = [
    { rep: 'Marcus Johnson', po_number: 'RO-DEMO-SENT', status: 'sent', delivery_date: addDays(today, 3), notes: 'Please deliver before Friday.', items: orderItems(stocked.length ? stocked : items.slice(0, 2)), created_at: at(2) },
    { rep: 'Dave Kim', po_number: 'RO-DEMO-DRAFT', status: 'draft', delivery_date: addDays(today, 6), notes: null, items: orderItems(items.filter((i) => i.rep_name === 'Dave Kim').slice(0, 2)), created_at: at(0, 15) },
  ];
  const messages = [
    { sender_name: 'Marcus Johnson', sender_email: 'marcus@sws-demo.com', sender_company: 'Southern Wine & Spirits', message_type: 'order_reply', subject: 'Re: Order RO-DEMO-SENT', body: 'Got it. We can deliver Thursday morning. Two bottles of the Casamigos are on allocation, so we will send one now and one next week.', request_type: null, is_read: false, message_status: 'pending', created_at: at(1, 16) },
    { sender_name: 'Rachel Torres', sender_email: 'rachel@rnd-demo.com', sender_company: 'Republic National Distributing', message_type: 'general', subject: 'Holiday ordering cutoff', body: 'Reminder that holiday orders close a week early this year. Send yours in by Monday to be safe.', request_type: null, is_read: true, message_status: 'approved', created_at: at(3, 14) },
  ];

  const e = (description: string, category: string, amount: number, monthsBack: number, day: number) => {
    const d = new Date(`${today}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - monthsBack, day);
    return { description, category, amount: r2(amount * p.salesScale ** 0.5), expense_date: d.toISOString().slice(0, 10), is_recurring: false };
  };
  const expenses = [0, 1, 2].flatMap((m) => [
    e('Utilities', 'utilities', 1480 + m * 35, m, 5), e('Music licence', 'licensing', 320, m, 12),
    e('Cleaning service', 'cleaning', 640, m, 20), e('Bookkeeping', 'professional', 450, m, 25),
  ]);

  const n = (event_type: string, title: string, body: string, link: string, is_read: boolean, daysAgo: number, key: string, payload: object = {}) =>
    ({ event_type, title, body, link, payload, dedupe_key: `universal-demo:${p.key}:${key}`, is_read, created_at: at(daysAgo, 14) });
  const low = items.filter((i) => i.current_stock < i.par_level).sort((a, b) => a.current_stock / a.par_level - b.current_stock / b.par_level);
  const newest = nights[nights.length - 1];
  const notifications = [
    n('inventory.low_stock', `${low.length} items dropped below par`, `${low.slice(0, 3).map((i) => i.name).join(', ')} and ${Math.max(0, low.length - 3)} more.`, '/app/inventory', false, 1, 'low', { itemIds: [] }),
    n('sales.z_report_closed', 'Last night is in', `Sales were $${newest.sales.toLocaleString('en-US')} with $${newest.ccTips.toLocaleString('en-US')} in card tips.`, '/app/sales', true, 1, 'night', { reportDate: newest.date, totalSales: newest.sales }),
    n('sales.anomaly', 'A quiet night', 'One night ran well under the same weekday over the last four weeks.', '/app/sales', false, 2, 'anomaly'),
    n('payroll.approval_needed', p.key === 'lounge' ? 'Payroll approved' : 'Payroll awaiting approval', p.key === 'lounge' ? 'The last pay period was approved.' : 'A pay period was submitted and is waiting for you.', '/app/payroll/review', p.key === 'lounge', 2, 'payroll'),
    n('weekly.summary', 'Your week at a glance', 'Sales, tips and labor for the last seven days are ready to read.', '/app/dashboard', true, 4, 'weekly'),
  ];

  const org = {
    slug: universalSlug(p.key), name: p.name.replace('Demo Bar - ', ''), bar_type: p.barType, bar_address: p.address,
    pos_provider: '2touch',
    pos_config: {
      agent_version: '1.4.0', agent_seen_at: now.toISOString(), last_sync_at: now.toISOString(), last_sync_errors: [],
      last_sync_summary: { zReports: 2, ewReports: 14, shiftsProtected: 0, itemAudit: 38, stockMoved: 21, unresolvedItems: 0, hoursRecorded: 9, serversRecorded: 3 },
    },
    bar_settings: {
      tip_split_percent: 18, barback_tip_pct: 15, default_hourly_rate: 15, default_pour_oz: 1.5,
      opener_bonus_type: 'fixed', opener_bonus_value: 25, bar_type: p.barType, bar_city: p.city, bar_state: p.state,
      hourly_rates: { bartender: 15, barback: 13, manager: 18, server: 13, security: 14, other: 13 },
      auto_reorder_enabled: true, bottle_sizes_ml: [375, 750, 1000, 1750],
      sales_tax_rate: p.state === 'IL' ? 10.25 : p.state === 'TX' ? 8.25 : 5.5, pos_prices_include_tax: false,
      _is_demo: true, _universal_demo: true,
    },
  };

  return { key: p.key, role: p.role, tz, today, org, categories: CATEGORIES, reps, employees, items, nights, shifts, hourly, serverSales,
    movements: [...movements, ...posSales], shipment, payrollRun, adjustment, payout, repOrders, messages, expenses, notifications };
}

export const buildUniversalBars = (now: Date) => DEMO_PROFILES.map((p) => buildBar(p, now));
