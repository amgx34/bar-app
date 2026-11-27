import { describe, it, expect } from 'vitest';
import { syncCooldownMessage, isStaleOnView } from './sync-cooldown';

const NOW = new Date('2026-11-25T20:00:00Z');
const ago = (s: number) => new Date(NOW.getTime() - s * 1000).toISOString();

describe('syncCooldownMessage', () => {
  it('refuses inside two minutes and says how long ago', () => {
    expect(syncCooldownMessage({ last_sync_at: ago(30) }, NOW)).toMatch(/Synced less than a minute ago/);
    expect(syncCooldownMessage({ last_sync_at: ago(90) }, NOW)).toMatch(/1 minute ago/);
  });
  it('allows at two minutes, with no sync yet, or with a bad date', () => {
    expect(syncCooldownMessage({ last_sync_at: ago(120) }, NOW)).toBeNull();
    expect(syncCooldownMessage({}, NOW)).toBeNull();
    expect(syncCooldownMessage({ last_sync_at: 'nope' }, NOW)).toBeNull();
  });
});

describe('isStaleOnView', () => {
  const base = { merchant_id: 'M', last_sync_at: ago(31 * 60) };
  it('is stale after 30 minutes for a connected API bar', () => {
    expect(isStaleOnView('clover', base, NOW)).toBe(true);
    expect(isStaleOnView('clover', { ...base, last_sync_at: ago(29 * 60) }, NOW)).toBe(false);
  });
  it('treats a connected bar that never synced as stale', () => {
    expect(isStaleOnView('toast', { restaurant_guid: 'R' }, NOW)).toBe(true);
  });
  it('never fires for 2touch, an unconnected bar, or one waiting on a reconnect', () => {
    expect(isStaleOnView('2touch', { agent_token: 'x' }, NOW)).toBe(false);
    expect(isStaleOnView('clover', {}, NOW)).toBe(false);
    expect(isStaleOnView('clover', { ...base, needs_reauth: true }, NOW)).toBe(false);
  });
});
