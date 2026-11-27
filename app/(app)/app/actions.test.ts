import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({ getUser: vi.fn(), signOut: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/org', () => ({ CURRENT_ORG_COOKIE: 'current_org_id' }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: m }) }));

beforeEach(() => { vi.resetAllMocks(); });

describe('signOut', () => {
  it('ends only this browser for the shared visitor, so other visitors stay in', async () => {
    m.getUser.mockResolvedValue({ data: { user: { email: 'shared-visitor@demo.example' } } });
    const { signOut } = await import('./actions');
    await signOut();
    expect(m.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('keeps the default for a real account', async () => {
    m.getUser.mockResolvedValue({ data: { user: { email: 'owner@realbar.com' } } });
    const { signOut } = await import('./actions');
    await signOut();
    expect(m.signOut).toHaveBeenCalledWith(undefined);
  });
});
