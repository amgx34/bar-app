import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { blockedAccess } from '@/lib/billing/paywall';
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';
import { after } from 'next/server';
import { runProviderSync } from '@/lib/pos/sync-run';
import { isStaleOnView } from '@/lib/pos/sync-cooldown';
import { getAuthUser, getCurrentOrg } from '@/lib/org';
import { hasAcceptedCurrentTerms } from '@/lib/terms';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/app/(app)/app/_components/app-sidebar';
import { ownMemberships } from '@/lib/api/org-scope';
import { AppHeader } from '@/app/(app)/app/_components/app-header';
import { BottomNav } from '@/app/(app)/app/_components/bottom-nav';
import { RouteFocus } from '@/app/(app)/app/_components/route-focus';
import { getOrgAccess, getOrgBilling } from '@/lib/billing/store';
import type { PosConfigShape } from '@/lib/pos/sync-health';
import { DemoBanner } from '@/app/(app)/app/_components/demo-banner';
import { isDemoOrg } from '@/lib/billing/store';
import { Breadcrumbs } from '@/app/(app)/app/_components/breadcrumbs';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // getAuthUser and getCurrentOrg are both memoized per request (lib/org.ts),
  // so this resolves the session once and the page below reuses it rather than
  // re-querying Supabase for the same two answers.
  const user = await getAuthUser();

  // Run concurrently: the org lookup and the consent check are independent, and
  // awaiting them in sequence put two network round trips in front of every
  // authenticated page for no reason.
  const [{ org, role, allMemberships }, accepted] = await Promise.all([
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

  // Clover and Toast are pulled, so a bar that opens the app with data older
  // than 30 minutes gets a refresh after the response is sent. The lease inside
  // runProviderSync keeps two tabs from syncing at once; a failure is recorded
  // in the sync strip by the run itself, so it is only logged here.
  if (isStaleOnView(org.pos_provider, (org.pos_config ?? {}) as PosConfigShape, new Date())) {
    after(() => runProviderSync(org.id).catch((e) => console.warn('[pos] stale-on-view sync failed:', e)));
  }

  // Off unless BILLING_ENFORCE=true; demo orgs exempt; never throws (see lib/billing/store.ts).
  const access = await getOrgAccess(org);
  const hasCustomer = !access.allowed && role === 'owner' ? !!(await getOrgBilling(org.id))?.stripe_customer_id : false;

  const showPage = access.allowed || blockedAccess((await headers()).get('x-path-query') ?? '', role) === 'pass';

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
          {isDemoOrg(org.slug) && <DemoBanner />}
          <AppHeader
            email={user?.email ?? ''}
            posProvider={org.pos_provider}
            orgName={org.name}
            orgSlug={org.slug}
            org={org}
            // RLS returns teammates' rows too; the switcher lists only the caller's own bars.
            memberships={ownMemberships(allMemberships, user?.id ?? '')}
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
            <div className="w-full min-w-0 flex-1">
              {showPage ? children : (
                <div className="mx-auto max-w-lg p-6 space-y-4">
                  <h1 className="text-2xl font-bold">Subscription needed</h1>
                  <p className="text-muted-foreground">
                    {role === 'owner'
                      ? 'This bar has no active Rail subscription. Your data is safe and will be here when you subscribe.'
                      : 'This bar has no active Rail subscription. Ask the owner to renew it.'}
                  </p>
                  {role === 'owner' && (
                    <p className="text-sm">
                      You can still <a className="underline" href="/app/settings?tab=data">export your data or close your bar</a> and{' '}
                      <a className="underline" href="/app/settings?tab=billing">see billing</a>.
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Questions? Email <a className="underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
                  </p>
                  {role === 'owner' && (
                    hasCustomer ? (
                      <form method="post" action="/api/billing/portal">
                        <button className="min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground">Manage billing</button>
                      </form>
                    ) : (
                      <form method="post" action="/api/billing/checkout" className="flex flex-wrap gap-3">
                        <button name="plan" value="close" className="min-h-11 rounded-lg border px-4 font-medium">Subscribe to Close</button>
                        <button name="plan" value="whole_bar" className="min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground">Subscribe to Whole bar</button>
                      </form>
                    )
                  )}
                </div>
              )}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>

      {/* Mobile-only navigation — fixed position, outside sidebar context */}
      <BottomNav />
      <RouteFocus />
    </>
  );
}
