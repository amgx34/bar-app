import { describe, it, expect } from 'vitest';
import { resolveAccountState } from './session-state';
import { buildStub } from './stub';
import { matchEmployeeName } from './claim';
import type { SnapshotEntry } from '@/lib/payroll/run-diff';

/**
 * The properties the portal's isolation rests on.
 *
 * Deliberately separate from the per-module tests: these are not about whether
 * a function works, they are the statements that must stay true for one
 * bartender never to read another's pay. If one of these fails, the feature is
 * unsafe to ship regardless of what else passes.
 */

const run: SnapshotEntry[] = [
  {
    employeeId: 'dana', employeeName: 'Dana', totalHours: 30, totalCompensation: 600,
    breakdown: {
      role: 'bartender', regularHours: 30, overtimeHours: 0, hourlyRate: 12,
      regularPay: 360, overtimePay: 0, tipAmount: 240, tipsPerHour: 8,
      effectiveHourlyRate: 20, payType: 'pool',
    },
  },
  {
    employeeId: 'sam', employeeName: 'Sam', totalHours: 20, totalCompensation: 900,
    breakdown: {
      role: 'manager', regularHours: 20, overtimeHours: 0, hourlyRate: 45,
      regularPay: 900, overtimePay: 0, tipAmount: 0, tipsPerHour: 0,
      effectiveHourlyRate: 45, payType: 'hourly',
    },
  },
];

describe('an employee can only ever reach their own figures', () => {
  it('a stub built for one employee contains no trace of another', () => {
    // The snapshot is the WHOLE run. This narrowing is the only thing standing
    // between a barback and the payroll of the entire bar.
    //
    // Asks for the SECOND entry on purpose: a bug that ignores the filter and
    // returns the first row would pass unnoticed if this asked for Dana, who
    // happens to be first. Verified by mutation — replacing the find() with
    // [0] fails this test.
    const stub = buildStub(run, 'sam');
    expect(stub?.employeeName).toBe('Sam');

    const serialised = JSON.stringify(stub);
    expect(serialised).not.toContain('Dana');
    expect(serialised).not.toContain('bartender');
    expect(serialised).not.toContain('240');
  });

  it('an employee absent from a run gets nothing, not an empty stub', () => {
    expect(buildStub(run, 'someone-else')).toBeNull();
  });

  it('a pending account yields no session to scope a query with', () => {
    const state = resolveAccountState({
      organization_id: 'org1', employee_id: 'dana', status: 'pending',
      employees: { name: 'Dana' },
    });
    expect(state.kind).toBe('pending');
    expect('session' in state).toBe(false);
  });

  it('a revoked account yields no session', () => {
    expect(resolveAccountState({
      organization_id: 'org1', employee_id: 'dana', status: 'revoked',
      employees: { name: 'Dana' },
    })).toEqual({ kind: 'none' });
  });

  it('an active session names exactly one employee and one org', () => {
    expect(resolveAccountState({
      organization_id: 'org1', employee_id: 'dana', status: 'active',
      employees: { name: 'Dana' },
    })).toEqual({
      kind: 'active',
      session: { orgId: 'org1', employeeId: 'dana', employeeName: 'Dana' },
    });
  });

  it('a status nobody has heard of is not a login', () => {
    // Fails closed. A new status added to the CHECK constraint later must not
    // become an active session merely by not being the string 'pending'.
    expect(resolveAccountState({
      organization_id: 'org1', employee_id: 'dana', status: 'suspended',
      employees: { name: 'Dana' },
    })).toEqual({ kind: 'none' });
  });
});

describe('claiming cannot be used to reach somebody else', () => {
  const roster = [
    { id: 'dana', name: 'Dana Whitfield' },
    { id: 'sam',  name: 'Sam Okafor' },
  ];

  it('a partial name claims nobody', () => {
    // Typing a colleague's first name must not claim their record.
    expect(matchEmployeeName('Dana', roster)).toEqual({ kind: 'none' });
    expect(matchEmployeeName('Sam', roster)).toEqual({ kind: 'none' });
  });

  it('a name that matches two people resolves to neither', () => {
    const twoDaves = [
      { id: 'd1', name: 'Dave Ramos' },
      { id: 'd2', name: 'Dave Ramos' },
    ];
    const match = matchEmployeeName('Dave Ramos', twoDaves);
    expect(match).toEqual({ kind: 'ambiguous' });
    // Critically, it carries no employee id — nothing downstream can be handed
    // one of the two by accident.
    expect('employeeId' in match).toBe(false);
  });
});
