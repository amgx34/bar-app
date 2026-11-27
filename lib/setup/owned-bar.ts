import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { DEMO_SLUG_PREFIX } from '@/lib/demo/constants';

/**
 * Oldest non-demo bar this user owns, or null. Reads through the cookie client,
 * so RLS applies, and THROWS on a database error: creating a bar is durable, so
 * "could not check" must never read as "owns nothing".
 */
export async function findOwnedBar(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('memberships')
    .select('organization_id, created_at, organizations(slug)')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .order('created_at', { ascending: true })
    .order('organization_id', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as { organization_id: string; organizations: { slug: string } | { slug: string }[] | null }[];
  const real = rows.find((r) => {
    const o = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations;
    return o && !o.slug.startsWith(DEMO_SLUG_PREFIX);
  });
  return real?.organization_id ?? null;
}
