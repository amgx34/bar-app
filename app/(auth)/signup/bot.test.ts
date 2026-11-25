import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('botid/server', () => ({ checkBotId: vi.fn(async () => ({ isBot: true })) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('@/lib/rate-limit', async (orig) => ({
  ...(await orig<typeof import('@/lib/rate-limit')>()),
  checkRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
}));
vi.mock('@/lib/auth/signup-open', () => ({ SIGNUP_OPEN: true }));

beforeEach(() => createClient.mockClear());

describe('signUpOwner with a bot verdict', () => {
  it('returns the generic throttle message and creates no account', async () => {
    const { signUpOwner } = await import('./actions');
    const r = await signUpOwner('a@b.co', 'a-long-enough-pass-9!', '');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toMatch(/Too many attempts/);
    expect(createClient).not.toHaveBeenCalled();
  });
});
