import { describe, it, expect, vi } from 'vitest';

const { createClient, createAdminClient } = vi.hoisted(() => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('botid/server', () => ({ checkBotId: vi.fn(async () => ({ isBot: true })) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }));

describe('createOrgWithSettings with a bot verdict', () => {
  it('refuses with the rate-limit answer and touches no database', async () => {
    const { createOrgWithSettings } = await import('./actions');
    const r = await createOrgWithSettings({ name: 'Tavern', accepted_terms: true });
    expect(r).toMatchObject({ ok: false, code: 'rate_limited' });
    expect(createClient).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
