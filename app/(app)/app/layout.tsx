import { getCurrentOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AppHeader } from './_components/app-header';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Org check — redirects to /app/no-access if user has zero memberships
  const { org, role, allMemberships } = await getCurrentOrg();

  return (
    <div className="min-h-dvh flex flex-col">
      <AppHeader
        email={user.email ?? ''}
        currentOrg={org}
        role={role}
        allMemberships={allMemberships}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}