import { describe, it, expect } from 'vitest';
import { friendlySyncError } from './sync-errors';

describe('friendlySyncError', () => {
  it('explains a missing permission and names the feed', () => {
    const m = friendlySyncError('api: clover payments: Clover 403 on /v3/merchants/M1/payments: forbidden');
    expect(m).toMatch(/Clover/);
    expect(m).toMatch(/payments/);
    expect(m).toMatch(/permission/i);
    expect(m).not.toMatch(/\/v3\//);
  });
  it('explains throttling and server trouble differently', () => {
    expect(friendlySyncError('api: toast orders: Toast 429 on /orders/v2/ordersBulk')).toMatch(/too many requests/i);
    expect(friendlySyncError('api: toast labor: Toast 503 on /labor/v1/shifts')).toMatch(/trouble on their side/i);
  });
  it('explains a rejected login', () => {
    expect(friendlySyncError('api: Toast rejected the saved API credentials. Reconnect Toast.')).toMatch(/Reconnect/);
  });
  it('explains a timeout and a missing time zone', () => {
    expect(friendlySyncError('abc: timed out after 15s')).toMatch(/too long/i);
    expect(friendlySyncError('api: Clover time zone is not set. Reconnect Clover so Rail can read it.')).toMatch(/time zone/i);
  });
  it('falls back to the message without the technical prefix', () => {
    expect(friendlySyncError('api: something odd')).toBe('something odd');
    expect(friendlySyncError('agent: items feed failed')).toBe('items feed failed');
  });
});
