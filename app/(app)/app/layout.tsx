import { redirect } from 'next/navigation';
import { getAuthUser, getCurrentOrg } from '@/lib/org';
import { hasAcceptedCurrentTerms } from '@/lib/terms';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/app/(app)/app/_components/app-sidebar';
import { AppHeader } from '@/app/(app)/app/_components/app-header';
import { BottomNav } from '@/app/(app)/app/_components/bottom-nav';
import { MobileFab } from '@/app/(app)/app/_components/mobile-fab';
import { RouteFocus } from '@/app/(app)/app/_components/route-focus';
import { Breadcrumbs } from '@/app/(app)/app/_components/breadcrumbs';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // getAuthUser and getCurrentOrg are both memoized per request (lib/org.ts),
  // so this resolves the session once and the page below reuses it rather than
  // re-querying Supabase for the same two answers.
  const user = await getAuthUser();

  // Run concurrently: the org lookup and the consent check are independent, and
  // awaiting them in sequence put two network round trips in front of every
  // authenticated page for no reason.
  const [{ org }, accepted] = await Promise.all([
    getCurrentOrg(),
    user ? hasAcceptedCurrentTerms(user.id) : Promise.resolve(true),
  ]);

  // Consent gate. Every /app route passes through this layout, which is what
  // makes it the one place a teammate provisioned by an owner — who never sees
  // /setup and its checkbox — can be asked to agree.
  //
  // Fails open: see lib/terms.ts for why a database hiccup must not wall
  // everyone out of their own bar.
  if (user && !accepted) {
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
          {/* Renders nothing above depth 2, so top-level pages are unchanged. */}
          <Breadcrumbs />

          <main
            id="main-content"
            tabIndex={-1}
            className="flex flex-1 min-w-0 flex-col pb-content-bottom md:pb-0 focus:outline-none"
          >
            {/* min-w-0 wrapper, not decoration.
                This <main> is a flex column, so whatever a page renders becomes
                a flex item with the default `min-width: auto` — it sizes to its
                own min-content and quietly grows past the viewport. On a 384px
                phone the dashboard came out 452px wide and its Low Stock and
                Tip Rate cards were cut off the right edge.
                Fixed here rather than on each page so a new route cannot
                reintroduce it by forgetting.
                Deliberately a BLOCK, not another flex column: a flex child is
                itself a flex item and inherits the same `min-width: auto`, so
                wrapping flex-in-flex changed nothing. */}
            <div className="w-full min-w-0 flex-1">{children}</div>
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
