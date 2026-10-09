import { describe, it, expect } from 'vitest';
import { assessSyncHealth, describeAge, describeDuration, type PosConfigShape } from './sync-health';

const NOW = new Date('2026-08-20T22:00:00Z');
const agoMinutes = (n: number) => new Date(NOW.getTime() - n * 60000).toISOString();

const agent = (over: Partial<PosConfigShape> = {}): PosConfigShape => ({
  agent_token: 'abc123',
  last_sync_at: agoMinutes(3),
  ...over,
});

describe('assessSyncHealth', () => {
  it('reports a recent clean sync as healthy', () => {
    const h = assessSyncHealth(agent(), '2touch', NOW);
    expect(h.status).toBe('healthy');
    expect(h.minutesAgo).toBe(3);
  });

  it('does not flag a bar that has no agent', () => {
    // Clover and manual-upload bars are not broken. Reporting them as "never
    // synced" would train everyone to ignore this strip entirely.
    expect(assessSyncHealth({}, 'clover', NOW).status).toBe('not-configured');
    expect(assessSyncHealth(null, null, NOW).status).toBe('not-configured');
    // Provider set but no token yet — setup half-done, still not a fault.
    expect(assessSyncHealth({}, '2touch', NOW).status).toBe('not-configured');
  });

  it('flags a configured agent that has never checked in', () => {
    const h = assessSyncHealth(agent({ last_sync_at: null }), '2touch', NOW);
    expect(h.status).toBe('down');
    expect(h.message).toMatch(/never checked in/);
  });

  it('warns after an hour of silence, without alarming', () => {
    const h = assessSyncHealth(agent({ last_sync_at: agoMinutes(90) }), '2touch', NOW);
    expect(h.status).toBe('stale');
    // A POS switched off overnight looks the same from here, so the copy must
    // say so rather than assert a fault.
    expect(h.message).toMatch(/switched off/);
    // "for 2 hours ago" is what you get from reusing the "ago" formatter here.
    expect(h.message).toMatch(/for 2 hours\./);
    expect(h.message).not.toMatch(/for .* ago/);
  });

  it('escalates to down after twelve hours', () => {
    const h = assessSyncHealth(agent({ last_sync_at: agoMinutes(13 * 60) }), '2touch', NOW);
    expect(h.status).toBe('down');
    expect(h.message).toMatch(/missing/);
    expect(h.message).toMatch(/for 13 hours\./);
    expect(h.message).not.toMatch(/for .* ago/);
  });

  it('holds the boundaries exactly', () => {
    expect(assessSyncHealth(agent({ last_sync_at: agoMinutes(59) }), '2touch', NOW).status).toBe('healthy');
    expect(assessSyncHealth(agent({ last_sync_at: agoMinutes(60) }), '2touch', NOW).status).toBe('stale');
    expect(assessSyncHealth(agent({ last_sync_at: agoMinutes(12 * 60 - 1) }), '2touch', NOW).status).toBe('stale');
    expect(assessSyncHealth(agent({ last_sync_at: agoMinutes(12 * 60) }), '2touch', NOW).status).toBe('down');
  });

  it('ranks errors above silence', () => {
    // A sync that ran two minutes ago and failed is more urgent than one that
    // ran an hour ago and worked.
    const h = assessSyncHealth(
      agent({ last_sync_at: agoMinutes(2), last_sync_errors: ['z_report_days: boom'] }),
      '2touch',
      NOW,
    );
    expect(h.status).toBe('errors');
    expect(h.errors).toEqual(['z_report_days: boom']);
  });

  it('reports errors even when the sync is also stale', () => {
    const h = assessSyncHealth(
      agent({ last_sync_at: agoMinutes(200), last_sync_errors: ['employee_shifts: boom'] }),
      '2touch',
      NOW,
    );
    expect(h.status).toBe('errors');
  });

  it('survives junk in the stored config rather than throwing', () => {
    // pos_config is untyped JSONB written by several code paths over time.
    const h = assessSyncHealth(
      { agent_token: 'x', last_sync_at: 'not-a-date', last_sync_errors: 'oops' as unknown },
      '2touch',
      NOW,
    );
    expect(h.errors).toEqual([]);
    expect(h.status).toBe('down');
  });

  it('carries the counts and agent version through', () => {
    const h = assessSyncHealth(
      agent({
        last_sync_summary: { zReports: 2, ewReports: 11, shiftsProtected: 3, stockMoved: 40 },
        agent_version: '1.2.0',
      }),
      '2touch',
      NOW,
    );
    expect(h.summary.shiftsProtected).toBe(3);
    expect(h.agentVersion).toBe('1.2.0');
  });

  /*
    The bug this whole block exists for.

    A bar's Z query threw on every cycle for a month. The agent caught it per
    feed, pushed an empty array, and this function — which looked only at
    recency and at errors — called it healthy. The dashboard showed "POS
    connected", the counts line dropped the zeroes rather than printing them,
    and nothing anywhere said that no sales had arrived since August.
  */
  it('does not call a sync healthy when it moved nothing at all', () => {
    const h = assessSyncHealth(
      agent({ last_sync_summary: { zReports: 0, ewReports: 0, itemAudit: 0 } }),
      '2touch',
      NOW,
    );
    expect(h.status).toBe('no-data');
    expect(h.message).toMatch(/no sales/i);
  });

  it('says the closed-bar reading out loud rather than asserting a fault', () => {
    // Two days shut is the same shape as a broken feed from here, and this
    // function cannot tell them apart. The copy has to admit that, the way the
    // stale band already does — a strip that cries wolf at every quiet Monday
    // gets ignored by March.
    const h = assessSyncHealth(
      agent({ last_sync_summary: { zReports: 0, ewReports: 0, itemAudit: 0 } }),
      '2touch',
      NOW,
    );
    expect(h.message).toMatch(/closed/i);
  });

  it('is healthy as soon as any feed moved something', () => {
    // One live feed is proof the pipe is open, so this must not fire on a bar
    // that simply has no Item Audit view configured.
    for (const summary of [
      { zReports: 2, ewReports: 0, itemAudit: 0 },
      { zReports: 0, ewReports: 11, itemAudit: 0 },
      { zReports: 0, ewReports: 0, itemAudit: 51 },
    ]) {
      expect(assessSyncHealth(agent({ last_sync_summary: summary }), '2touch', NOW).status)
        .toBe('healthy');
    }
  });

  it('stays healthy when the agent is too old to report a summary', () => {
    // No summary is "cannot say", not "moved nothing". An agent predating
    // last_sync_summary must not light up every dashboard it touches.
    expect(assessSyncHealth(agent(), '2touch', NOW).status).toBe('healthy');
    expect(assessSyncHealth(agent({ last_sync_summary: null }), '2touch', NOW).status).toBe('healthy');
    expect(assessSyncHealth(agent({ last_sync_summary: {} }), '2touch', NOW).status).toBe('healthy');
  });

  it('ranks a real error above an empty sync', () => {
    // An error names what broke; "nothing arrived" only says that something
    // did. The more actionable sentence wins.
    const h = assessSyncHealth(
      agent({
        last_sync_errors: ['agent: Z Report query failed: Invalid column name'],
        last_sync_summary: { zReports: 0, ewReports: 0, itemAudit: 0 },
      }),
      '2touch',
      NOW,
    );
    expect(h.status).toBe('errors');
  });

  it('ranks silence above an empty sync', () => {
    // A box that stopped reporting hours ago is a bigger fact than what its
    // last payload happened to contain.
    const h = assessSyncHealth(
      agent({
        last_sync_at: agoMinutes(90),
        last_sync_summary: { zReports: 0, ewReports: 0, itemAudit: 0 },
      }),
      '2touch',
      NOW,
    );
    expect(h.status).toBe('stale');
  });

  it('never returns a negative age for a clock skewed into the future', () => {
    // The agent's clock is not ours, and a future timestamp must not render as
    // "-4 min ago".
    const h = assessSyncHealth(agent({ last_sync_at: agoMinutes(-30) }), '2touch', NOW);
    expect(h.minutesAgo).toBe(0);
    expect(h.status).toBe('healthy');
  });
});

describe('describeAge', () => {
  it('reads naturally across the ranges', () => {
    expect(describeAge(null)).toBe('never');
    expect(describeAge(0)).toBe('just now');
    expect(describeAge(45)).toBe('45 min ago');
    expect(describeAge(60)).toBe('1 hour ago');
    expect(describeAge(180)).toBe('3 hours ago');
    expect(describeAge(60 * 24)).toBe('1 day ago');
    expect(describeAge(60 * 24 * 3)).toBe('3 days ago');
  });
});

describe('describeDuration', () => {
  it('omits "ago", so a sentence can supply its own preposition', () => {
    expect(describeDuration(90)).toBe('2 hours');
    expect(describeDuration(45)).toBe('45 minutes');
    expect(describeDuration(60 * 24 * 2)).toBe('2 days');
    expect(describeDuration(null)).toBe('an unknown time');
    for (const m of [0, 45, 90, 1440, null]) {
      expect(describeDuration(m)).not.toMatch(/ago/);
    }
  });
});
