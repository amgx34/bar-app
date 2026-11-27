import { describe, it, expect } from 'vitest';
import { orderOutcome, orderStatusLabel, plainOrderError, outcomeMessage } from './order-status';

describe('orderOutcome', () => {
  it('is sent when the requested email went out', () => {
    expect(orderOutcome({ wantEmail: true, wantSms: false, emailFailed: false, smsFailed: false }).status).toBe('sent');
  });
  it('is not sent when the only requested channel failed', () => {
    const o = orderOutcome({ wantEmail: true, wantSms: false, emailFailed: true, smsFailed: false });
    expect(o.status).toBe('draft');
    expect(o.failed).toEqual(['email']);
  });
  it('is not sent when nothing was requested', () => {
    expect(orderOutcome({ wantEmail: false, wantSms: false, emailFailed: false, smsFailed: false }).status).toBe('draft');
  });
  it('is sent when one channel works and the other fails', () => {
    const o = orderOutcome({ wantEmail: true, wantSms: true, emailFailed: true, smsFailed: false });
    expect(o.status).toBe('sent');
    expect(o.failed).toEqual(['email']);
  });
});

describe('labels and messages', () => {
  it('labels drafts as not sent', () => {
    expect(orderStatusLabel('draft')).toBe('Saved, not sent');
    expect(orderStatusLabel('sent')).toBe('Sent');
  });
  it('explains a failed email without developer wording', () => {
    const m = outcomeMessage('Mike', ['email']);
    expect(m).toMatch(/saved/i);
    expect(m).toMatch(/Mike/);
    expect(m).not.toMatch(/GMAIL|password|settings|SMTP/i);
    expect(m).not.toMatch(/—/);
  });
  it('never leaks a raw server message', () => {
    expect(plainOrderError(new Error('duplicate key value violates constraint "x"'))).not.toMatch(/duplicate/);
    expect(plainOrderError(new Error('Not authorized'))).toMatch(/permission/i);
    expect(plainOrderError('weird')).toBeTruthy();
  });
});
