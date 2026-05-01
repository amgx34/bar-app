import { getCurrentOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/app/(app)/app/_components/app-sidebar';
import { AppHeader } from '@/app/(app)/app/_components/app-header';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader email={''} currentOrg={undefined} role={undefined} allMemberships={undefined} />           {/* We'll keep only the profile part */}
        <main className="flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}