import { createClient } from '@supabase/supabase-js';
import { guardClient } from '@/lib/demo/write-guard';

/** Unguarded: only for the demo seed and refresh, which must write to the sample bars. */
export const createSeedAdminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// Writes made for the shared sample-bar visitor are refused here (lib/demo/write-guard.ts).
export const createAdminClient = () => guardClient(createSeedAdminClient());
