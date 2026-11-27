import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  createClient: vi.fn(), createAdminClient: vi.fn(), checkRateLimit: vi.fn(),
  getUser: vi.fn(), signIn: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('botid/server', () => ({ checkBotId: vi.fn(async () => ({ isBot: false })) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: m.createClient }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.createAdminClient }));
vi.mock('@/lib/rate-limit', async (orig) => ({ ...(await orig<object>()), checkRateLimit: m.checkRateLimit }));

const post = () => new NextRequest('http://localhost/api/demo', { method: 'POST' });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.DEMO_USER_PASSWORD = 'a-long-random-demo-password-0123456789';
  m.createClient.mockResolvedValue({ auth: { getUser: m.getUser, signInWithPassword: m.signIn } });
  m.getUser.mockResolvedValue({ data: { user: null } });
  m.signIn.mockResolvedValue({ error: null });
  m.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSeconds: 0 });
});

describe('POST /api/demo enters the shared sample bar', () => {
  it('signs in as the shared visitor and creates nothing', async () => {
    const { POST } = await import('./route');
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ redirectTo: '/app/dashboard' });
    expect(m.signIn).toHaveBeenCalledWith({ email: 'shared-visitor@demo.example', password: process.env.DEMO_USER_PASSWORD });
    expect(m.createAdminClient).not.toHaveBeenCalled();
  });

  it('leaves a real signed-in account alone', async () => {
    m.getUser.mockResolvedValue({ data: { user: { email: 'owner@realbar.com' } } });
    const { POST } = await import('./route');
    const body = await (await POST(post())).json();
    expect(body).toEqual({ redirectTo: '/app/dashboard', alreadySignedIn: true });
    expect(m.signIn).not.toHaveBeenCalled();
  });

  it('does not sign in again when the visitor is already in the sample bar', async () => {
    m.getUser.mockResolvedValue({ data: { user: { email: 'shared-visitor@demo.example' } } });
    const { POST } = await import('./route');
    expect((await (await POST(post())).json()).redirectTo).toBe('/app/dashboard');
    expect(m.signIn).not.toHaveBeenCalled();
  });

  it('moves someone still in an old per-visitor demo into the shared bar', async () => {
    m.getUser.mockResolvedValue({ data: { user: { email: 'demo-abc@rail.demo' } } });
    const { POST } = await import('./route');
    expect(await (await POST(post())).json()).toEqual({ redirectTo: '/app/dashboard' });
    expect(m.signIn).toHaveBeenCalled();
  });

  it('says so plainly when the demo account is not set up', async () => {
    delete process.env.DEMO_USER_PASSWORD;
    const { POST } = await import('./route');
    expect((await POST(post())).status).toBe(503);
    expect(m.signIn).not.toHaveBeenCalled();
  });

  it('allows a whole classroom behind one address', async () => {
    const { RATE_LIMITS } = await import('@/lib/rate-limit');
    expect(RATE_LIMITS.demoCreate.limit).toBeGreaterThanOrEqual(120);
  });
});
