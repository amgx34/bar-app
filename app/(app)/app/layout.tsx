import { getCurrentOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/app/(app)/app/_components/app-sidebar';
import { AppHeader } from '@/app/(app)/app/_components/app-header';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  await getCurrentOrg(); // redirects to /setup or /login if needed

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader email={user?.email ?? ''} currentOrg={undefined} role={undefined} allMemberships={undefined} />
        <main className="flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
