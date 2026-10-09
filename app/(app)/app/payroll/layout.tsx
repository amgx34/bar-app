import { Suspense } from 'react';
import { SectionTabs } from '../_components/section-tabs';
import { RunPayrollLink, RunPayrollLinkFallback } from './_components/run-payroll-link';
import { OpenRunBanner } from './_components/open-run-banner';

/**
 * Payroll's shell: one heading, one call to action, one tab strip.
 *
 * In the layout rather than on each page so the strip does not re-mount as you
 * move between tabs, and so no page can accidentally render a second copy — the
 * failure that had two different tab rows stacked on Inventory.
 *
 * The Run Payroll link carries the week the Pay Run is showing, so a previous
 * week can actually be run rather than only looked at. On the tabs that show no
 * week it carries nothing and the review screen defaults to the current one —
 * see run-payroll-link.tsx.
 */
export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-6 pb-4 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Calculate wages, tips, and manage staff pay
          </p>
        </div>

        {/* Suspense because reading the query string opts this subtree out of
            prerendering; without it the button is missing from the initial HTML. */}
        <Suspense fallback={<RunPayrollLinkFallback />}>
          <RunPayrollLink />
        </Suspense>
      </div>

      {/* Above the tabs, so it is the same notice wherever you are in Payroll.
          Its own Suspense boundary: it costs one indexed row, but the shell
          should never wait on it to paint. */}
      <Suspense fallback={null}>
        <OpenRunBanner />
      </Suspense>

      <SectionTabs />

      <div className="min-w-0">{children}</div>
    </div>
  );
}
