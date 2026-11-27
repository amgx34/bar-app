import { describe, it, expect } from 'vitest';
import { assessSyncHealth } from '@/lib/pos/sync-health';
import {
  detectLowStock, detectFeedStale, detectWeeklySummary, weekEndingOn,
  type WeeklyInput,
} from './detect';

const item = (id: string, name: string, current: number, par: number) =>
  ({ id, name, current_stock: current, par_level: par });

/** Mon 2026-11-16 .. Sun 2026-11-22, and the week before it. */
const WEEK = weekEndingOn('2026-11-22')!;
const dates = (start: string) =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
const night = (report_date: string, total_sales: number, cash_tips = 0, cc_tips = 0) =>
  ({ report_date, total_sales, cash_tips, cc_tips });
const fullWeek = (start: string, perNight: number) => dates(start).map((d) => night(d, perNight));

const input = (over: Partial<WeeklyInput> = {}): WeeklyInput => ({
  week: WEEK,
  days: [...fullWeek('2026-11-09', 1000), ...fullWeek('2026-11-16', 1080)],
  hoursThisWeek: 100,
  items: [],
  pendingPayrollRuns: 0,
  feedNote: null,
  ...over,
});

describe('weekEndingOn', () => {
  it('builds Monday to Sunday and the week before it', () => {
    expect(WEEK).toEqual({
      start: '2026-11-16', end: '2026-11-22', priorStart: '2026-11-09', priorEnd: '2026-11-15',
    });
  });
  it('refuses a day that is not a Sunday', () => {
    expect(weekEndingOn('2026-11-23')).toBeNull();
  });
  it('crosses a year boundary', () => {
    expect(weekEndingOn('2027-01-03')).toMatchObject({ start: '2026-12-28', priorStart: '2026-12-21' });
  });
});

describe('detectWeeklySummary', () => {
  it('totals the week, compares it, and keys the dedupe on the week start', () => {
    const r = detectWeeklySummary(input())!;
    expect(r.draft.eventType).toBe('weekly.summary');
    expect(r.draft.dedupeKey).toBe('weekly.summary:2026-11-16');
    expect(r.summary.salesText).toBe('$7,560');
    expect(r.summary.change.text).toBe('Up 8% on the week before');
  });

  it('says incomplete, never a drop, when a night is missing this week', () => {
    const days = [...fullWeek('2026-11-09', 1000), ...fullWeek('2026-11-16', 1000).slice(0, 6)];
    const r = detectWeeklySummary(input({ days }))!;
    expect(r.summary.change.tone).toBe('unknown');
    expect(r.summary.change.text).toMatch(/not compared/i);
    expect(r.summary.change.text).not.toMatch(/down/i);
    expect(r.summary.nightsReported).toBe(6);
  });

  it('compares a bar that is closed on the same weekday in both weeks', () => {
    const closedMonday = (w: string, n: number) => fullWeek(w, n).slice(1);
    const days = [...closedMonday('2026-11-09', 1000), ...closedMonday('2026-11-16', 1100)];
    expect(detectWeeklySummary(input({ days }))!.summary.change.text).toBe('Up 10% on the week before');
  });

  it('does not compare when the prior week has no reports at all', () => {
    const r = detectWeeklySummary(input({ days: fullWeek('2026-11-16', 1000) }))!;
    expect(r.summary.change.tone).toBe('unknown');
  });

  it('shows dollars only when the base is under the floor', () => {
    const days = [night('2026-11-09', 50), night('2026-11-16', 90)];
    const r = detectWeeklySummary(input({ days }))!;
    expect(r.summary.change.text).toBe('Up $40 on the week before');
  });

  it('returns null when neither week has a Z report', () => {
    expect(detectWeeklySummary(input({ days: [] }))).toBeNull();
  });

  it('reports tips per hour from recorded tips and hours, and omits it when it cannot say', () => {
    const days = [...fullWeek('2026-11-09', 1000), ...fullWeek('2026-11-16', 1000).map((d, i) => i === 0 ? { ...d, cash_tips: 100, cc_tips: 300 } : d)];
    expect(detectWeeklySummary(input({ days, hoursThisWeek: 100 }))!.summary.tipsPerHour).toBe('$4.00 an hour');
    expect(detectWeeklySummary(input({ days, hoursThisWeek: 0 }))!.summary.tipsPerHour).toBeNull();
  });

  it('counts low stock the same way the nightly digest does', () => {
    const items = [item('a', 'Gin', 1, 5), item('b', 'Rum', 9, 5), item('c', 'Vodka', 0, 4)];
    const digest = detectLowStock(items, null, '2026-11-22')!;
    const r = detectWeeklySummary(input({ items }))!;
    expect(r.summary.lowStock).toBe((digest.payload!.itemIds as string[]).length);
  });

  it('mentions a pay run waiting, with no amount and no name', () => {
    const r = detectWeeklySummary(input({ pendingPayrollRuns: 1 }))!;
    expect(r.draft.body).toMatch(/pay run/i);
  });

  it('leads with the stale feed text when the feed is stale', () => {
    const health = assessSyncHealth({ agent_token: 't', last_sync_at: '2026-11-18T10:00:00Z' }, '2touch', new Date('2026-11-23T13:00:00Z'));
    const stale = detectFeedStale(health, '2touch')!;
    const r = detectWeeklySummary(input({ feedNote: stale.title }))!;
    expect(r.summary.feedNote).toBe(stale.title);
    expect(r.draft.body.startsWith(stale.title)).toBe(true);
  });

  it('carries bar totals only: no names, no pay, in the draft or the payload', () => {
    const items = [item('a', 'Secret Reserve Whisky', 1, 5)];
    const r = detectWeeklySummary(input({ items }))!;
    const blob = JSON.stringify(r);
    expect(blob).not.toMatch(/Secret Reserve/);
    expect(Object.keys(r.draft.payload!).sort()).toEqual(
      ['hoursWorked', 'lowStock', 'nightsReported', 'pendingApprovals', 'priorWeekComparable', 'totalSales', 'weekStart'].sort(),
    );
  });
});
