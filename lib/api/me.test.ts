import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { handleMe, type MeDeps } from './me';
import { MeResponseSchema } from './contract';
import { INTERNAL_MESSAGE } from './envelope';

const U = '00000000-0000-4000-8000-000000000001';
const A1 = '00000000-0000-4000-8000-0000000000a1';
const A2 = '00000000-0000-4000-8000-0000000000a2';
const OTHER = '00000000-0000-4000-8000-0000000000b9';
const E1 = '00000000-0000-4000-8000-0000000000e1';
const user = { id: U, email: 'me@example.com' };
const NOW = new Date('2026-11-25T12:00:00.000Z');

const m = (org: string, name: string, role: string, created_at = '2026-01-01T00:00:00Z', user_id = U) => ({
  user_id, organization_id: org, role, created_at, organizations: { id: org, name },
});

function deps(over: Partial<MeDeps> = {}): MeDeps {
  return {
    authorization: 'Bearer good',
    requestedOrg: null,
    requestId: 'req-1',
    now: () => NOW,
    verify: async () => ({ user }),
    load: async () => ({ membershipRows: [], accountRow: null }),
    ...over,
  };
}
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const data = (r: { body: unknown }) => (r.body as { data: J }).data;
const err = (r: { body: unknown }) => (r.body as { error: J }).error;

describe('handleMe', () => {
  it('valid single member: contract shape, active org is theirs', async () => {
    const r = await handleMe(deps({ load: async () => ({ membershipRows: [m(A1, 'Bar One', 'manager')], accountRow: null }) }));
    expect(r.status).toBe(200);
    expect(MeResponseSchema.safeParse(r.body).success).toBe(true);
    expect(data(r).memberships).toHaveLength(1);
    expect(data(r).memberships[0].destinations).toHaveLength(5);
    expect(data(r).activeOrgId).toBe(A1);
    expect(r.headers['X-Request-Id']).toBe('req-1');
  });

  it('a manager in a bar whose owner row is oldest is a manager', async () => {
    const rows = [m(A1, 'Bar One', 'owner', '2020-01-01T00:00:00Z', 'someone-else'), m(A1, 'Bar One', 'manager', '2026-01-01T00:00:00Z')];
    const r = await handleMe(deps({ load: async () => ({ membershipRows: rows, accountRow: null }) }));
    expect(data(r).memberships).toHaveLength(1);
    expect(data(r).memberships[0].role).toBe('manager');
  });

  it('X-Rail-Org for a bar the caller is not in is ignored and never leaks its name', async () => {
    const rows = [m(A1, 'Bar One', 'owner'), m(A2, 'Bar Two', 'owner'), m(OTHER, 'Secret Bar', 'owner', '2026-01-01T00:00:00Z', 'x')];
    const r = await handleMe(deps({ requestedOrg: OTHER, load: async () => ({ membershipRows: rows, accountRow: null }) }));
    expect(data(r).activeOrgId).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain('Secret Bar');
    expect(JSON.stringify(r.body)).not.toContain(OTHER);
  });

  it('two orgs: header selects, none leaves it null', async () => {
    const rows = [m(A1, 'Bar One', 'owner'), m(A2, 'Bar Two', 'accountant')];
    const load = async () => ({ membershipRows: rows, accountRow: null });
    expect(data(await handleMe(deps({ load }))).activeOrgId).toBeNull();
    expect(data(await handleMe(deps({ load, requestedOrg: A2 }))).activeOrgId).toBe(A2);
  });

  it('drops a role outside owner, manager, accountant', async () => {
    const r = await handleMe(deps({ load: async () => ({ membershipRows: [m(A1, 'Bar One', 'bouncer')], accountRow: null }) }));
    expect(data(r).memberships).toEqual([]);
    expect(data(r).activeOrgId).toBeNull();
  });

  it('staff states: active, pending, revoked', async () => {
    const acct = (status: string) => ({ organization_id: A1, employee_id: E1, status, employees: { name: 'E' } });
    const run = async (status: string) => data(await handleMe(deps({ load: async () => ({ membershipRows: [], accountRow: acct(status) }) })));
    expect((await run('active')).staff).toEqual({ kind: 'active', orgId: A1, employeeId: E1 });
    expect((await run('pending')).staff).toEqual({ kind: 'pending' });
    expect((await run('revoked')).staff).toEqual({ kind: 'none' });
    expect((await run('active')).memberships).toEqual([]);
  });

  it.each([
    ['no bearer', { authorization: null }],
    ['malformed bearer', { authorization: 'Basic abc' }],
  ])('%s is 401', async (_n, over) => {
    const r = await handleMe(deps(over as Partial<MeDeps>));
    expect(r.status).toBe(401);
    expect(err(r).code).toBe('unauthenticated');
    expect(err(r).requestId).toBe('req-1');
  });

  it.each(['invalid', 'expired'])('%s token is 401', async (why) => {
    const r = await handleMe(deps({ verify: async () => ({ user: null, reason: why }) }));
    expect(r.status).toBe(401);
    expect(JSON.stringify(r.body)).not.toContain('good');
  });

  it('loader error is 500 with the fixed message and no internals', async () => {
    const r = await handleMe(deps({ load: async () => { throw new Error('relation memberships secret detail'); } }));
    expect(r.status).toBe(500);
    expect(err(r).message).toBe(INTERNAL_MESSAGE);
    expect(JSON.stringify(r.body)).not.toContain('secret detail');
  });

  it('verify throwing is 500, not a leak', async () => {
    const r = await handleMe(deps({ verify: async () => { throw new Error('boom'); } }));
    expect(r.status).toBe(500);
  });

  it('a user that fails the schema is a 500', async () => {
    const r = await handleMe(deps({ verify: async () => ({ user: { id: 'not-a-uuid', email: 'a@b.c' } }) }));
    expect(r.status).toBe(500);
  });
});

describe('shared fixtures', () => {
  const fx = (n: string) => JSON.parse(readFileSync(`native/RailKit/Tests/RailKitTests/Fixtures/${n}.json`, 'utf8'));
  const run = async (n: string, over: Partial<MeDeps>) => {
    const f = fx(n);
    const r = await handleMe(deps({ verify: async () => ({ user: f.data.user }), ...over }));
    expect(r.body).toEqual(f);
  };
  it('me.member', () => run('me.member', { load: async () => ({ membershipRows: [m(A1, 'Fixture Bar One', 'manager')], accountRow: null }) }));
  it('me.two-orgs', () => run('me.two-orgs', { load: async () => ({ membershipRows: [m(A1, 'Fixture Bar One', 'owner'), m(A2, 'Fixture Bar Two', 'accountant')], accountRow: null }) }));
  it('me.staff', () => run('me.staff', { load: async () => ({ membershipRows: [], accountRow: { organization_id: A1, employee_id: E1, status: 'active', employees: null } }) }));
});
