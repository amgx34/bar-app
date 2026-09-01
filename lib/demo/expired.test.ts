import { describe, it, expect } from 'vitest';
import { selectExpiredDemoOrgs, type PurgeableOrg } from './expired';

const PREFIX = 'demo-tipsy-tavern-';
const CUTOFF = '2026-09-01T00:00:00.000Z';

const org = (id: string, slug: string | null, created: string): PurgeableOrg =>
  ({ id, slug, created_at: created });

describe('selectExpiredDemoOrgs', () => {
  it('reclaims an orphaned demo org that has no membership left', () => {
    // The regression this whole change exists for: the org survived its purge
    // pass, its user and membership are long gone, and the old membership-driven
    // sweep could never see it again.
    const orgs = [org('a', `${PREFIX}abc`, '2026-05-13T03:16:06Z')];
    expect(selectExpiredDemoOrgs(orgs, PREFIX, CUTOFF)).toEqual(['a']);
  });

  it('never touches a real bar', () => {
    const orgs = [
      org('real', 'scottys-on-vine', '2020-01-01T00:00:00Z'),
      org('demo', `${PREFIX}xyz`,    '2026-05-13T00:00:00Z'),
    ];
    expect(selectExpiredDemoOrgs(orgs, PREFIX, CUTOFF)).toEqual(['demo']);
  });

  it('leaves a live demo session alone', () => {
    // Inside the TTL — someone may be clicking around in it right now.
    const orgs = [org('live', `${PREFIX}new`, '2026-09-01T06:00:00Z')];
    expect(selectExpiredDemoOrgs(orgs, PREFIX, CUTOFF)).toEqual([]);
  });

  it('does not match a bar that merely mentions demo in its slug', () => {
    const orgs = [
      org('trap', 'demos-bar-and-grill', '2020-01-01T00:00:00Z'),
      org('trap2', 'the-demo-lounge',    '2020-01-01T00:00:00Z'),
    ];
    expect(selectExpiredDemoOrgs(orgs, PREFIX, CUTOFF)).toEqual([]);
  });

  it('tolerates a null slug', () => {
    expect(selectExpiredDemoOrgs([org('n', null, '2020-01-01T00:00:00Z')], PREFIX, CUTOFF)).toEqual([]);
  });

  it('is idempotent — a second pass over what is left selects nothing', () => {
    const orgs = [org('a', `${PREFIX}abc`, '2026-05-13T00:00:00Z')];
    const first = selectExpiredDemoOrgs(orgs, PREFIX, CUTOFF);
    const remaining = orgs.filter((o) => !first.includes(o.id));
    expect(selectExpiredDemoOrgs(remaining, PREFIX, CUTOFF)).toEqual([]);
  });

  it('selects every orphan in one pass', () => {
    const orgs = Array.from({ length: 35 }, (_, i) =>
      org(`o${i}`, `${PREFIX}${i}`, '2026-06-01T00:00:00Z'));
    expect(selectExpiredDemoOrgs(orgs, PREFIX, CUTOFF)).toHaveLength(35);
  });
});
