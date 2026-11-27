/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at untyped JSON */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ApiErrorBodySchema, SessionSchema, MeResponseSchema, MoneyString, QuantityString,
  RoleSchema, DestinationSchema, ROLES, DESTINATIONS, SessionEnvelopeSchema,
} from './contract';
import { API_ERROR_STATUS } from './envelope';

const DIR = join(process.cwd(), 'native/RailKit/Tests/RailKitTests/Fixtures');
const U1 = '00000000-0000-4000-8000-000000000001';
const O1 = '00000000-0000-4000-8000-0000000000a1';
const me = {
  data: {
    user: { id: U1, email: 'member@example.com' },
    memberships: [{ orgId: O1, orgName: 'Fixture Bar', role: 'manager', destinations: ['today', 'stock'] }],
    activeOrgId: O1,
    staff: { kind: 'none' },
  },
  meta: { asOf: '2026-11-25T12:00:00.000Z' },
};

describe('decimal strings', () => {
  it('money is exactly two places, a string', () => {
    expect(MoneyString.safeParse('12.50').success).toBe(true);
    expect(MoneyString.safeParse('-0.01').success).toBe(true);
    for (const bad of [12.5, '12.5', '12.500', '1e3', ' 1.00', '', null]) expect(MoneyString.safeParse(bad).success).toBe(false);
  });
  it('quantity is exactly four places, a string', () => {
    expect(QuantityString.safeParse('3.2500').success).toBe(true);
    for (const bad of [3.25, '3.25', '3.25000', 'abc']) expect(QuantityString.safeParse(bad).success).toBe(false);
  });
});

describe('enums', () => {
  it('roles and destinations are the app values', () => {
    expect([...ROLES]).toEqual(['owner', 'manager', 'accountant']);
    expect([...DESTINATIONS]).toEqual(['today', 'stock', 'sales', 'team-pay', 'books']);
    expect(RoleSchema.safeParse('bartender').success).toBe(false);
    expect(DestinationSchema.safeParse('profile').success).toBe(false);
  });
});

describe('me', () => {
  it('accepts a valid example', () => expect(MeResponseSchema.safeParse(me).success).toBe(true));
  it('accepts staff active and null activeOrgId', () => {
    const s = structuredClone(me) as any;
    s.data.activeOrgId = null;
    s.data.staff = { kind: 'active', orgId: O1, employeeId: U1 };
    expect(MeResponseSchema.safeParse(s).success).toBe(true);
  });
  it('rejects unknown role, missing field, wrong type', () => {
    const a = structuredClone(me) as any; a.data.memberships[0].role = 'janitor';
    const b = structuredClone(me) as any; delete b.data.user;
    const c = structuredClone(me) as any; c.data.user.id = 7;
    const d = structuredClone(me) as any; d.data.staff = { kind: 'active' };
    for (const x of [a, b, c, d]) expect(MeResponseSchema.safeParse(x).success).toBe(false);
  });
});

describe('session and error', () => {
  const session = { accessToken: 'a', refreshToken: 'r', expiresAt: '2026-11-25T13:00:00.000Z', tokenType: 'bearer', user: { id: U1, email: 'x@example.com' } };
  it('session accepts valid, rejects bad expiry and token type', () => {
    expect(SessionSchema.safeParse(session).success).toBe(true);
    expect(SessionSchema.safeParse({ ...session, expiresAt: 'tomorrow' }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...session, tokenType: 'basic' }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...session, refreshToken: undefined }).success).toBe(false);
  });
  it('error body accepts every envelope code and rejects unknown', () => {
    for (const code of Object.keys(API_ERROR_STATUS)) expect(ApiErrorBodySchema.safeParse({ error: { code, message: 'm' } }).success).toBe(true);
    expect(ApiErrorBodySchema.safeParse({ error: { code: 'nope', message: 'm' } }).success).toBe(false);
    expect(ApiErrorBodySchema.safeParse({ error: { code: 'internal' } }).success).toBe(false);
  });
});

describe('shared fixtures', () => {
  const schemas: Record<string, { safeParse(v: unknown): { success: boolean } }> = {
    'me.member.json': MeResponseSchema,
    'me.two-orgs.json': MeResponseSchema,
    'me.staff.json': MeResponseSchema,
    'auth.session.json': SessionEnvelopeSchema,
    'error.unauthenticated.json': ApiErrorBodySchema,
    'error.rate-limited.json': ApiErrorBodySchema,
  };
  it('every fixture file has a schema and vice versa', () => {
    expect(readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()).toEqual(Object.keys(schemas).sort());
  });
  for (const [file, schema] of Object.entries(schemas)) {
    it(`${file} validates`, () => {
      expect(schema.safeParse(JSON.parse(readFileSync(join(DIR, file), 'utf8'))).success).toBe(true);
    });
  }
});
