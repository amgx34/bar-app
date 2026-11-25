import { createClient } from '@supabase/supabase-js';

/** A client that acts AS THE CALLER: anon key plus their access token, no cookies, no session kept. RLS applies. */
export function createBearerClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}
