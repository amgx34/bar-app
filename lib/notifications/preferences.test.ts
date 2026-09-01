import { describe, it, expect } from 'vitest';
import { wantsNotification, resolveRecipients, type PreferenceRow } from './preferences';

const owner      = { userId: 'u1', role: 'owner'      as const };
const manager    = { userId: 'u2', role: 'manager'    as const };
const accountant = { userId: 'u3', role: 'accountant' as const };

const mute = (userId: string, event_type: string): PreferenceRow =>
  ({ user_id: userId, event_type, muted: true });
const unmute = (userId: string, event_type: string): PreferenceRow =>
  ({ user_id: userId, event_type, muted: false });

describe('wantsNotification', () => {
  it('falls back to the role default when no row exists', () => {
    expect(wantsNotification(manager, 'inventory.low_stock', [])).toBe(true);
    expect(wantsNotification(accountant, 'inventory.low_stock', [])).toBe(false);
  });

  it('does not tell a manager about approvals they are the ones requesting', () => {
    expect(wantsNotification(manager, 'payroll.approval_needed', [])).toBe(false);
    expect(wantsNotification(owner, 'payroll.approval_needed', [])).toBe(true);
  });

  it('lets an explicit mute beat a role default', () => {
    expect(wantsNotification(owner, 'sales.anomaly', [mute('u1', 'sales.anomaly')])).toBe(false);
  });

  it('lets an explicit opt-in beat a role default', () => {
    expect(wantsNotification(accountant, 'sales.anomaly', [unmute('u3', 'sales.anomaly')])).toBe(true);
  });

  it("ignores another user's preference row", () => {
    expect(wantsNotification(owner, 'sales.anomaly', [mute('u2', 'sales.anomaly')])).toBe(true);
  });

  it('ignores a row for a different event', () => {
    expect(wantsNotification(owner, 'sales.anomaly', [mute('u1', 'inventory.low_stock')])).toBe(true);
  });
});

describe('resolveRecipients', () => {
  it('keeps only those who want the event', () => {
    const got = resolveRecipients([owner, manager, accountant], 'inventory.low_stock', []);
    expect(got.map((r) => r.userId)).toEqual(['u1', 'u2']);
  });

  it('can resolve to nobody', () => {
    const prefs = [mute('u1', 'sales.anomaly'), mute('u2', 'sales.anomaly')];
    expect(resolveRecipients([owner, manager, accountant], 'sales.anomaly', prefs)).toEqual([]);
  });
});
