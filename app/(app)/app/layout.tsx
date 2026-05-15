import { getCurrentOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/app/(app)/app/_components/app-sidebar';
import { AppHeader } from '@/app/(app)/app/_components/app-header';
import { BottomNav } from '@/app/(app)/app/_components/bottom-nav';
import { MobileFab } from '@/app/(app)/app/_components/mobile-fab';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { org } = await getCurrentOrg();

  return (
    <>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader
            email={user?.email ?? ''}
            posProvider={org.pos_provider}
            orgName={org.name}
          />
          <main className="flex-1 pb-16 md:pb-0">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>

      {/* Mobile-only navigation — fixed position, outside sidebar context */}
      <BottomNav />
      <MobileFab />
    </>
  );
}
