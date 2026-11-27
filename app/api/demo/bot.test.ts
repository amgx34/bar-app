import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createClient, createAdminClient } = vi.hoisted(() => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('botid/server', () => ({ checkBotId: vi.fn(async () => ({ isBot: true })) }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }));

describe('POST /api/demo with a bot verdict', () => {
  it('answers 429 and provisions nothing', async () => {
    const { POST } = await import('./route');
    const res = await POST(new NextRequest('http://localhost/api/demo', { method: 'POST' }));
    expect(res.status).toBe(429);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});
