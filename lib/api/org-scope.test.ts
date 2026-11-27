import { describe, expect, it } from 'vitest';
import { ownMemberships, selectActive } from './org-scope';

const row = (user_id: string | undefined, organization_id: string, role: string, created_at = '2026-01-01T00:00:00Z') => ({
  user_id, organization_id, role, created_at,
});

const OWNER = 'u-owner';
const MGR = 'u-manager';
const BAR = 'org-1';

describe('ownMemberships', () => {
  it("keeps only the caller's rows", () => {
    const rows = [row(OWNER, BAR, 'owner'), row(MGR, BAR, 'manager')];
    expect(ownMemberships(rows, MGR)).toEqual([rows[1]]);
  });
  it('drops rows without a user_id', () => {
    expect(ownMemberships([row(undefined, BAR, 'owner')], MGR)).toEqual([]);
  });
  it('null, undefined and empty give []', () => {
    expect(ownMemberships(null, MGR)).toEqual([]);
    expect(ownMemberships(undefined, MGR)).toEqual([]);
    expect(ownMemberships([], MGR)).toEqual([]);
  });
});

describe('selectActive', () => {
  it('a manager in a bar whose owner row is oldest is never owner', () => {
    const rows = [row(OWNER, BAR, 'owner', '2026-01-01T00:00:00Z'), row(MGR, BAR, 'manager', '2026-02-01T00:00:00Z')];
    expect(selectActive(rows, MGR, null)?.role).toBe('manager');
    expect(selectActive(rows, MGR, BAR)?.role).toBe('manager');
  });
  it('unknown preferred org falls back to the caller\'s first', () => {
    const rows = [row(MGR, BAR, 'manager')];
    expect(selectActive(rows, MGR, 'nope')?.organization_id).toBe(BAR);
  });
  it("ignores a preferred org the caller is not in", () => {
    const rows = [row(OWNER, 'org-2', 'owner'), row(MGR, BAR, 'manager')];
    expect(selectActive(rows, MGR, 'org-2')?.organization_id).toBe(BAR);
  });
  it('a user in two bars selects by preferred id', () => {
    const rows = [row(MGR, BAR, 'manager', '2026-01-01T00:00:00Z'), row(MGR, 'org-2', 'accountant', '2026-02-01T00:00:00Z')];
    expect(selectActive(rows, MGR, 'org-2')?.role).toBe('accountant');
  });
  it('empty and null give null', () => {
    expect(selectActive([], MGR, BAR)).toBeNull();
    expect(selectActive(null, MGR, BAR)).toBeNull();
    expect(selectActive([row(OWNER, BAR, 'owner')], MGR, BAR)).toBeNull();
  });
  it('tied created_at is deterministic regardless of input order', () => {
    const a = row(MGR, 'org-a', 'manager');
    const b = row(MGR, 'org-b', 'accountant');
    expect(selectActive([a, b], MGR, null)).toEqual(selectActive([b, a], MGR, null));
  });
});
