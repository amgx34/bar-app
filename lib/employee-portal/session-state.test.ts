import { describe, it, expect } from 'vitest';
import { resolveAccountState, type AccountRow } from './session-state';

const row = (over: Partial<AccountRow> = {}): AccountRow => ({
  organization_id: 'org1',
  employee_id: 'emp1',
  status: 'active',
  employees: { name: 'Dana' },
  ...over,
});

describe('resolveAccountState', () => {
  it('resolves an active account to its own org and employee', () => {
    expect(resolveAccountState(row())).toEqual({
      kind: 'active',
      session: { orgId: 'org1', employeeId: 'emp1', employeeName: 'Dana' },
    });
  });

  it('gives a pending account no session', () => {
    // A claim nobody has approved must not read anybody's pay.
    expect(resolveAccountState(row({ status: 'pending' }))).toEqual({ kind: 'pending' });
  });

  it('treats a revoked account as no account at all', () => {
    // Deliberately not distinguished from 'none': a revoked employee is told
    // nothing about why, and gets the same screen as a stranger.
    expect(resolveAccountState(row({ status: 'revoked' }))).toEqual({ kind: 'none' });
  });

  it('gives no session when there is no row', () => {
    expect(resolveAccountState(null)).toEqual({ kind: 'none' });
  });

  it('gives no session when an active row somehow names no employee', () => {
    // The CHECK constraint forbids this. Belt and braces: a session with a
    // null employee id would scope every portal query to nothing, or worse.
    expect(resolveAccountState(row({ employee_id: null }))).toEqual({ kind: 'none' });
  });

  it('treats an unrecognised status as no account rather than as active', () => {
    // Fails closed. A status this code has never heard of must not become a
    // login just because it is not the string 'pending'.
    expect(resolveAccountState(row({ status: 'something_new' }))).toEqual({ kind: 'none' });
  });

  it('reads the employee name whether the join came back as a row or an array', () => {
    // PostgREST returns an embedded one-to-one as either shape depending on the
    // relationship it infers; the app handles both elsewhere for the same reason.
    expect(resolveAccountState(row({ employees: [{ name: 'Dana' }] })))
      .toEqual({
        kind: 'active',
        session: { orgId: 'org1', employeeId: 'emp1', employeeName: 'Dana' },
      });
  });
});
