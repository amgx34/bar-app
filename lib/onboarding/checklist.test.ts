import { describe, it, expect } from 'vitest';
import { buildChecklist } from './checklist';
import { applyOnboardingDismissed } from './dismiss';

const base = { posProvider: null, posConfig: {}, employeeCount: 0, itemCount: 0, liveZCount: 0 };
const byKey = (c: ReturnType<typeof buildChecklist>, k: string) => c.items.find((i) => i.key === k)!;

describe('buildChecklist', () => {
  it('is four items, none done, for an empty bar', () => {
    const c = buildChecklist(base);
    expect(c.items).toHaveLength(4);
    expect(c.doneCount).toBe(0);
    expect(c.allDone).toBe(false);
  });

  it('counts the team and the stock', () => {
    const c = buildChecklist({ ...base, employeeCount: 3, itemCount: 40 });
    expect(byKey(c, 'team').status).toBe('done');
    expect(byKey(c, 'stock').status).toBe('done');
    expect(c.doneCount).toBe(2);
  });

  it('a paired 2Touch bar that has not synced yet is still to do, and says why', () => {
    const c = buildChecklist({ ...base, posProvider: '2touch', posConfig: { agent_token: 'x' } });
    expect(byKey(c, 'pos').status).toBe('todo');
    expect(byKey(c, 'pos').why.length).toBeGreaterThan(10);
  });

  it('a synced POS is done', () => {
    const c = buildChecklist({
      ...base, posProvider: 'clover',
      posConfig: { merchant_id: 'm', last_sync_at: '2026-11-20T00:00:00Z', last_sync_errors: [] },
    });
    expect(byKey(c, 'pos').status).toBe('done');
  });

  it('last_sync_errors is a problem, not done', () => {
    const c = buildChecklist({
      ...base, posProvider: '2touch',
      posConfig: { agent_token: 'x', last_sync_at: '2026-11-20T00:00:00Z', last_sync_errors: ['agent: z feed failed'] },
    });
    expect(byKey(c, 'pos').status).toBe('problem');
    expect(c.doneCount).toBe(0);
  });

  it('a login Clover or Toast refused is a problem', () => {
    const c = buildChecklist({
      ...base, posProvider: 'toast',
      posConfig: { restaurant_guid: 'g', last_sync_at: '2026-11-20T00:00:00Z', needs_reauth: true },
    });
    expect(byKey(c, 'pos').status).toBe('problem');
  });

  it('a backfill-only bar has no first night', () => {
    const c = buildChecklist({ ...base, liveZCount: 0 });
    expect(byKey(c, 'night').status).toBe('todo');
  });

  it('a live night is done', () => {
    expect(byKey(buildChecklist({ ...base, liveZCount: 1 }), 'night').status).toBe('done');
  });

  it('all four done', () => {
    const c = buildChecklist({
      posProvider: '2touch', employeeCount: 2, itemCount: 5, liveZCount: 2,
      posConfig: { agent_token: 'x', last_sync_at: '2026-11-20T00:00:00Z', last_sync_errors: [] },
    });
    expect(c.allDone).toBe(true);
    expect(c.doneCount).toBe(4);
  });
});

describe('applyOnboardingDismissed', () => {
  it('keeps every other setting, so a stale read cannot revert one', () => {
    const latest = { tip_split_percent: 70, timezone: 'America/Chicago' };
    const out = applyOnboardingDismissed(latest, '2026-11-25T00:00:00Z');
    expect(out).toEqual({ ...latest, onboarding_dismissed_at: '2026-11-25T00:00:00Z' });
    expect(latest).not.toHaveProperty('onboarding_dismissed_at');
  });
});
