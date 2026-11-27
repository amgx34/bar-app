import { describe, it, expect } from 'vitest';
import { DEMO_PROFILES } from './profiles.ts';
import { DEMO_SLUG_PREFIX } from './constants.ts';
import {
  UNIVERSAL_SLUG_PREFIX, universalSlug, localDate, addDays, splitByWeights, buildBar, assertSeedTarget,
} from './universal.ts';

// 2026-11-27 03:00 UTC is still the 26th in Chicago.
const NOW = new Date('2026-11-27T03:00:00Z');
const bars = DEMO_PROFILES.map((p) => ({ p, bar: buildBar(p, NOW) }));

describe('dates', () => {
  it('uses the bar\'s own calendar day, not UTC', () => {
    expect(localDate(NOW, 'America/Chicago')).toBe('2026-11-26');
    expect(localDate(NOW, 'UTC')).toBe('2026-11-27');
  });
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('splitByWeights', () => {
  it('always adds back to the total to the cent', () => {
    const parts = splitByWeights(1234.57, [0.04, 0.06, 0.09, 0.13, 0.18, 0.22, 0.16, 0.08, 0.04]);
    expect(Math.round(parts.reduce((a, b) => a + b, 0) * 100)).toBe(123457);
  });
});

describe('universal slugs', () => {
  it('never match the old per-visitor sweep', () => {
    for (const p of DEMO_PROFILES) {
      expect(universalSlug(p.key).startsWith(UNIVERSAL_SLUG_PREFIX)).toBe(true);
      expect(universalSlug(p.key).startsWith(DEMO_SLUG_PREFIX)).toBe(false);
    }
  });
});

describe('seed target guard', () => {
  it('allows only the dev project', () => {
    expect(() => assertSeedTarget('https://dev.supabase.co', 'https://dev.supabase.co', 'https://live.supabase.co', false)).not.toThrow();
  });
  it('refuses the live project even with a dev-looking env, unless --allow-remote', () => {
    expect(() => assertSeedTarget('https://live.supabase.co', 'https://dev.supabase.co', 'https://live.supabase.co', false)).toThrow(/live/i);
  });
  it('refuses any host that is not the dev one', () => {
    expect(() => assertSeedTarget('https://other.supabase.co', 'https://dev.supabase.co', 'https://live.supabase.co', false)).toThrow();
    expect(() => assertSeedTarget('https://other.supabase.co', 'https://dev.supabase.co', 'https://live.supabase.co', true)).not.toThrow();
  });
  it('refuses when there is no dev project configured', () => {
    expect(() => assertSeedTarget('https://x.supabase.co', undefined, undefined, false)).toThrow();
  });
});

describe('buildBar', () => {
  it('is relative to today: every night is within the last 14 days, none today or future', () => {
    for (const { bar } of bars) {
      const today = localDate(NOW, bar.tz);
      for (const n of bar.nights) {
        expect(n.date < today).toBe(true);
        expect(n.date >= addDays(today, -14)).toBe(true);
      }
    }
  });
  it('moves with the clock', () => {
    const later = buildBar(DEMO_PROFILES[0], new Date('2026-12-20T18:00:00Z'));
    expect(later.nights.at(-1)!.date).toBe('2026-12-19');
  });
  it('gives busy weekends and quiet Tuesdays whatever today is', () => {
    const t = buildBar(DEMO_PROFILES[0], NOW);
    const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
    const sat = t.nights.filter((n) => dow(n.date) === 6);
    const sun = t.nights.filter((n) => dow(n.date) === 0);
    expect(t.nights.some((n) => dow(n.date) === 2)).toBe(false);
    expect(Math.min(...sat.map((n) => n.sales))).toBeGreaterThan(Math.max(...sun.map((n) => n.sales)));
  });
  it('keeps card tips equal to server tips and the cash and card split equal to sales', () => {
    for (const { bar } of bars) for (const n of bar.nights) {
      expect(Math.round(n.servers.reduce((a, s) => a + s.tips, 0) * 100)).toBe(Math.round(n.ccTips * 100));
      expect(Math.round((n.cashSales + n.cardSales) * 100)).toBe(Math.round(n.sales * 100));
    }
  });
  it('hourly rows add up to each night and peak late', () => {
    for (const { bar } of bars) {
      for (const n of bar.nights) {
        const rows = bar.hourly.filter((h) => h.business_date === n.date);
        expect(Math.round(rows.reduce((a, r) => a + r.net_sales, 0) * 100)).toBe(Math.round(n.sales * 100));
        const peak = rows.reduce((a, b) => (b.net_sales > a.net_sales ? b : a));
        expect([22, 23]).toContain(peak.hour);
      }
    }
  });
  it('shows one manual cash tip night so the manual rule is visible', () => {
    for (const { bar } of bars) {
      const manual = bar.nights.filter((n) => n.cashTipsSource === 'manual');
      expect(manual.length).toBe(1);
      expect(manual[0].cashTips).toBeGreaterThan(0);
    }
  });
  it('stock story: tavern has low, out and over par; corner has several below par', () => {
    const state = (b: typeof bars[number]['bar']) => ({
      low: b.items.filter((i) => i.current_stock > 0 && i.current_stock < i.par_level).length,
      out: b.items.filter((i) => i.current_stock === 0).length,
      over: b.items.filter((i) => i.current_stock > i.par_level).length,
    });
    const t = state(bars[0].bar);
    expect(t.low).toBeGreaterThanOrEqual(3); expect(t.out).toBeGreaterThanOrEqual(1); expect(t.over).toBeGreaterThanOrEqual(1);
    expect(state(bars[2].bar).low).toBeGreaterThan(t.low);
  });
  it('shipment: two clocks stay separate, lines carry unit_cost, invoice total adds up', () => {
    const lounge = bars[1].bar; // the busy bar has the shipment with freight and tax
    const s = lounge.shipment!;
    const today = localDate(NOW, lounge.tz);
    expect(s.invoice_date).toBe(addDays(today, -5));
    expect(s.received_date).not.toBe(s.invoice_date);
    expect(s.lines.length).toBe(4);
    expect(s.lines.every((l) => l.unit_cost > 0 && l.quantity > 0)).toBe(true);
    const goods = s.lines.reduce((a, l) => a + l.quantity * l.unit_cost, 0);
    expect(s.invoice_total).toBeCloseTo(goods + s.freight + s.tax, 2);
    expect(s.freight).toBeGreaterThan(0); expect(s.tax).toBeGreaterThan(0);
    for (const { bar } of bars) expect(bar.shipment === null || bar.shipment.lines.every((l) => bar.items.some((i) => i.name === l.item))).toBe(true);
  });
  it('payroll: tavern submitted, lounge approved, corner none; snapshot matches shifts', () => {
    expect(bars[0].bar.payrollRun?.status).toBe('pending_approval');
    expect(bars[1].bar.payrollRun?.status).toBe('approved');
    expect(bars[2].bar.payrollRun).toBeNull();
    const run = bars[0].bar.payrollRun!;
    expect(run.snapshot.length).toBeGreaterThan(0);
    expect(run.period_end < localDate(NOW, bars[0].bar.tz)).toBe(true);
    const emp = run.snapshot[0];
    const hours = bars[0].bar.shifts
      .filter((s) => s.employee === emp.employeeName && s.date >= run.period_start && s.date <= run.period_end)
      .reduce((a, s) => a + s.regular_hours + s.overtime_hours, 0);
    expect(emp.totalHours).toBeCloseTo(hours, 2);
  });
  it('reps: three reps, a sent and a draft order, two messages', () => {
    const b = bars[0].bar;
    expect(b.reps.length).toBe(3);
    expect(b.repOrders.map((o) => o.status).sort()).toEqual(['draft', 'sent']);
    expect(b.messages.length).toBe(2);
    expect(b.reps.every((r) => /555/.test(r.phone))).toBe(true);
  });
  it('books: expenses across three months', () => {
    for (const { bar } of bars) {
      const months = new Set(bar.expenses.map((e) => e.expense_date.slice(0, 7)));
      expect(months.size).toBeGreaterThanOrEqual(3);
    }
  });
  it('notifications: five per bar, unique keys, mixed read state', () => {
    for (const { bar } of bars) {
      expect(bar.notifications.length).toBe(5);
      expect(new Set(bar.notifications.map((n) => n.dedupe_key)).size).toBe(5);
      expect(bar.notifications.some((n) => n.is_read)).toBe(true);
      expect(bar.notifications.some((n) => !n.is_read)).toBe(true);
    }
  });
  it('POS looks healthy and cannot be pushed to', () => {
    for (const { bar } of bars) {
      const cfg = bar.org.pos_config as Record<string, unknown>;
      expect(cfg.agent_token).toBeUndefined();
      expect(cfg.needs_reauth).toBeUndefined();
      expect(cfg.last_sync_errors).toEqual([]);
      expect(cfg.last_sync_at).toBe(NOW.toISOString());
      expect((cfg.last_sync_summary as { zReports: number }).zReports).toBeGreaterThan(0);
      expect(bar.org.slug.startsWith(UNIVERSAL_SLUG_PREFIX)).toBe(true);
    }
  });
  it('employees: one W-2 and one 1099, no bank details anywhere', () => {
    const e = bars[0].bar.employees;
    expect(e.some((x) => x.tax_classification === 'w2')).toBe(true);
    expect(e.some((x) => x.tax_classification === 'contractor_1099')).toBe(true);
    expect(JSON.stringify(bars)).not.toMatch(/routing|account_number/i);
  });
});
