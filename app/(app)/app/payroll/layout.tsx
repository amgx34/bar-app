import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { SectionTabs } from '../_components/section-tabs';

/**
 * Payroll's shell: one heading, one call to action, one tab strip.
 *
 * In the layout rather than on each page so the strip does not re-mount as you
 * move between tabs, and so no page can accidentally render a second copy — the
 * failure that had two different tab rows stacked on Inventory.
 *
 * The Run Payroll link carries no dates. The review screen defaults to the
 * current pay week on its own, and passing a stale range from whichever tab you
 * happened to be on would be worse than letting it choose.
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

        <Link
          href="/app/payroll/review"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <ClipboardCheck className="h-4 w-4" aria-hidden />
          Run Payroll
        </Link>
      </div>

      <SectionTabs />

      <div className="min-w-0">{children}</div>
    </div>
  );
}
