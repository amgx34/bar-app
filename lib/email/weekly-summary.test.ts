import { describe, it, expect } from 'vitest';
import { renderWeeklyEmail } from './weekly-summary';
import type { WeeklySummary } from '@/lib/notifications/detect';

const base: WeeklySummary = {
  weekStart: '2026-11-16', weekLabel: 'Nov 16 to Nov 22', salesText: '$7,560', nightsReported: 7,
  change: { text: 'Up 8% on the week before', tone: 'up' }, tipsPerHour: '$4.00 an hour',
  hoursText: '100 labor hours', lowStock: 2, pendingApprovals: 1, feedNote: null,
};

describe('renderWeeklyEmail', () => {
  it('carries every figure in html and text, with a dark-mode rule', () => {
    const r = renderWeeklyEmail(base, 'https://x.test/');
    for (const part of ['$7,560', 'Up 8%', '$4.00 an hour', '100 labor hours', '2 items are below par', 'pay run']) {
      expect(r.html).toContain(part);
      expect(r.text).toContain(part);
    }
    expect(r.html).toContain('prefers-color-scheme: dark');
    expect(r.html).toContain('https://x.test/app/dashboard');
    expect(r.subject).toBe('Your week at the bar: $7,560');
  });
  it('escapes markup in the stale-feed note', () => {
    const r = renderWeeklyEmail({ ...base, feedNote: '<b>x</b>' }, 'https://x.test');
    expect(r.html).not.toContain('<b>x</b>');
    expect(r.html).toContain('&lt;b&gt;');
  });
});
