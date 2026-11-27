import { describe, it, expect } from 'vitest';
import { blockedAccess } from './paywall';

describe('blockedAccess', () => {
  it('lets an owner reach Settings > Data and Billing', () => {
    expect(blockedAccess('/app/settings?tab=data', 'owner')).toBe('pass');
    expect(blockedAccess('/app/settings?tab=billing', 'owner')).toBe('pass');
  });
  it('blocks other settings tabs and other pages for an owner', () => {
    expect(blockedAccess('/app/settings?tab=team', 'owner')).toBe('paywall');
    expect(blockedAccess('/app/settings', 'owner')).toBe('paywall');
    expect(blockedAccess('/app/inventory', 'owner')).toBe('paywall');
    expect(blockedAccess('/app/settingsx?tab=data', 'owner')).toBe('paywall');
  });
  it('blocks everything for a non-owner and when the path is unknown', () => {
    expect(blockedAccess('/app/settings?tab=data', 'manager')).toBe('paywall');
    expect(blockedAccess('', 'owner')).toBe('paywall');
  });
});
