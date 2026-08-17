import { redirect } from 'next/navigation';
import { getCurrentOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { hasAcceptedCurrentTerms } from '@/lib/terms';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/app/(app)/app/_components/app-sidebar';
import { AppHeader } from '@/app/(app)/app/_components/app-header';
import { BottomNav } from '@/app/(app)/app/_components/bottom-nav';
import { MobileFab } from '@/app/(app)/app/_components/mobile-fab';
import { RouteFocus } from '@/app/(app)/app/_components/route-focus';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { org } = await getCurrentOrg();

  // Consent gate. Every /app route passes through this layout, which is what
  // makes it the one place a teammate provisioned by an owner — who never sees
  // /setup and its checkbox — can be asked to agree.
  //
  // One indexed lookup on a user id, and it fails open: see lib/terms.ts for
  // why a database hiccup must not wall everyone out of their own bar.
  if (user && !(await hasAcceptedCurrentTerms(user.id))) {
    redirect('/accept-terms');
  }

  return (
    <>
      {/* Keyboard users would otherwise tab the whole sidebar and header on
          every page before reaching content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-nav-top focus:top-3 focus:left-3 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:font-semibold focus:text-primary focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader
            email={user?.email ?? ''}
            posProvider={org.pos_provider}
            orgName={org.name}
            orgSlug={org.slug}
          />
          {/* tabIndex={-1} makes this a programmatic focus target for the skip
              link and for the route-change focus move. */}
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 pb-bottom-nav md:pb-0 focus:outline-none"
          >
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>

      {/* Mobile-only navigation — fixed position, outside sidebar context */}
      <BottomNav />
      <MobileFab />
      <RouteFocus />
    </>
  );
}
