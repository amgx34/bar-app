import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { guardClient } from '@/lib/demo/write-guard';

export const createClient = async () => {
  const cookieStore = await cookies();
  return guardClient(createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* called from RSC, ignore */ }
        },
      },
    }
  ));
};
