import { describe, it, expect, vi } from 'vitest';
import { deliverWeekly, type WeeklyDeps } from './weekly';
import { detectWeeklySummary, weekEndingOn } from './detect';

const result = detectWeeklySummary({
  week: weekEndingOn('2026-11-22')!,
  days: [{ report_date: '2026-11-16', total_sales: 500, cash_tips: 0, cc_tips: 0 }],
  hoursThisWeek: 0, items: [], pendingPayrollRuns: 0, feedNote: null,
})!;

const owner = { userId: 'o1', role: 'owner' as const };
const mgr = { userId: 'm1', role: 'manager' as const };

function deps(over: Partial<WeeklyDeps> = {}) {
  const sent: string[] = [];
  const d: WeeklyDeps = {
    dispatch: vi.fn(async () => 1),
    alreadySent: async () => false,
    emailFor: async (u) => `${u}@example.test`,
    sendEmail: async (to) => { sent.push(to); },
    siteUrl: 'https://x.test',
    emailBudget: { left: 10 },
    ...over,
  };
  return { d, sent };
}

describe('deliverWeekly', () => {
  it('emails owners by default and not managers', async () => {
    const { d, sent } = deps();
    const r = await deliverWeekly(result, [owner, mgr], [], d);
    expect(sent).toEqual(['o1@example.test']);
    expect(r.emailed).toBe(1);
  });
  it('honours a mute and an explicit opt-in', async () => {
    const { d, sent } = deps();
    await deliverWeekly(result, [owner, mgr], [
      { user_id: 'o1', event_type: 'weekly.summary', muted: true },
      { user_id: 'm1', event_type: 'weekly.summary', muted: false },
    ], d);
    expect(sent).toEqual(['m1@example.test']);
  });
  it('is a no-op on a re-run of the same week', async () => {
    const { d, sent } = deps({ alreadySent: async () => true });
    await deliverWeekly(result, [owner], [], d);
    expect(sent).toEqual([]);
    expect(d.dispatch).not.toHaveBeenCalled();
  });
  it('keeps going when one send throws', async () => {
    const { d, sent } = deps({ sendEmail: async (to) => { if (to.startsWith('o1')) throw new Error('smtp'); sent2.push(to); } });
    const sent2: string[] = [];
    const r = await deliverWeekly(result, [owner, { userId: 'o2', role: 'owner' }], [], d);
    expect(sent2).toEqual(['o2@example.test']);
    expect(r.errors).toHaveLength(1);
    expect(sent).toEqual([]);
  });
  it('stops emailing at the budget', async () => {
    const { d, sent } = deps({ emailBudget: { left: 1 } });
    const r = await deliverWeekly(result, [owner, { userId: 'o2', role: 'owner' }], [], d);
    expect(sent).toHaveLength(1);
    expect(r.errors[0]).toMatch(/budget/);
  });
});
