import { describe, it, expect } from 'vitest';
import { planRetire } from './retire';

const org = (id: string, slug: string, created = '2026-05-01T00:00:00Z', demo = false) =>
  ({ id, slug, created_at: created, bar_settings: demo ? { _is_demo: true } : {} });
const user = (id: string, email: string, created = '2026-05-01T00:00:00Z') => ({ id, email, created_at: created });

describe('planRetire', () => {
  it('picks old per-visitor orgs and users, with counts and the oldest and newest dates', () => {
    const p = planRetire({
      orgs: [org('o1', 'demo-tipsy-tavern-a', '2026-05-01T00:00:00Z'), org('o2', 'demo-tipsy-tavern-b', '2026-06-01T00:00:00Z')],
      users: [user('u1', 'demo-1@rail.demo')],
      memberships: [{ user_id: 'u1', organization_id: 'o1' }],
    });
    expect(p.orgs.map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(p.users.map((u) => u.id)).toEqual(['u1']);
    expect(p.oldestOrg).toBe('2026-05-01T00:00:00Z');
    expect(p.newestOrg).toBe('2026-06-01T00:00:00Z');
  });

  it('never selects the permanent sample bars or the shared visitor', () => {
    const p = planRetire({
      orgs: [org('t', 'rail-demo-tavern', '2020-01-01T00:00:00Z', true)],
      users: [user('s', 'shared-visitor@demo.example')],
      memberships: [{ user_id: 's', organization_id: 't' }],
    });
    expect(p.orgs).toEqual([]);
    expect(p.users).toEqual([]);
  });

  it('finds early unprefixed demo orgs by their demo marker', () => {
    const p = planRetire({ orgs: [org('e', 'tipsy-early', '2026-01-01T00:00:00Z', true)], users: [], memberships: [] });
    expect(p.orgs.map((o) => o.id)).toEqual(['e']);
  });

  it('protects an org that a real person also belongs to', () => {
    const p = planRetire({
      orgs: [org('o1', 'demo-tipsy-tavern-a')],
      users: [user('u1', 'demo-1@rail.demo'), user('r', 'owner@realbar.com')],
      memberships: [{ user_id: 'u1', organization_id: 'o1' }, { user_id: 'r', organization_id: 'o1' }],
    });
    expect(p.orgs).toEqual([]);
    expect(p.protectedOrgs.map((o) => o.id)).toEqual(['o1']);
  });
});
