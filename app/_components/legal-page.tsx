import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SITE_NAME } from '@/lib/site';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ScrollProgress } from '@/app/_components/scroll-progress';
import { BackToTop } from '@/app/_components/back-to-top';

/**
 * Shell for the public policy pages. They sit outside the (app) group, so they
 * get no sidebar and no auth — and they need to stay readable and indexable.
 */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  /** ISO date. Rendered and used for the <time> element. */
  updated: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  const updatedLabel = new Date(`${updated}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      {/* These are long documents people are asked to read before agreeing to
          them, so progress and a way back up are worth more here than anywhere
          else on the site. */}
      <ScrollProgress />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-nav-top focus:top-3 focus:left-3 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:font-semibold focus:text-primary focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      {/* Sticky so "Back to site" is reachable from page four of the Terms
          without scrolling back. print:static drops it out of the printed copy,
          where a fixed header repeats on every sheet. */}
      <header className="sticky top-0 z-nav border-b border-border bg-card/95 backdrop-blur-sm print:static print:bg-transparent">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="font-heading font-bold text-lg tracking-[0.3em] uppercase text-primary"
          >
            {SITE_NAME}
          </Link>
          <div className="flex items-center gap-1 print:hidden">
            <ThemeToggle />
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors duration-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back to site
            </Link>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <article className="max-w-3xl mx-auto px-6 py-14">
          <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
            {title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated{' '}
            <time dateTime={updated}>{updatedLabel}</time>
          </p>

          {intro && (
            <div className="mt-6 text-base leading-relaxed text-muted-foreground">
              {intro}
            </div>
          )}

          {/* Sections are h2; the type scale is set here so each page stays
              consistent without repeating classes on every heading. */}
          <div
            className="
              mt-10 space-y-8
              [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight
              [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:scroll-mt-20
              [&_h3]:font-heading [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2
              [&_p]:leading-relaxed [&_p]:text-[0.9375rem]
              [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:text-[0.9375rem]
              [&_li]:leading-relaxed
              [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
              [&_table]:w-full [&_table]:text-sm [&_table]:border-collapse
              [&_th]:text-left [&_th]:font-semibold [&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-4
              [&_td]:border-b [&_td]:border-border [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top
              [&_strong]:font-semibold
            "
          >
            {children}
          </div>
        </article>
      </main>

      <BackToTop />

      <footer className="border-t border-border bg-card print:hidden">
        <div className="max-w-3xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</p>
          <nav aria-label="Legal" className="flex gap-5">
            <Link href="/privacy" className="hover:text-primary transition-colors duration-200">Privacy</Link>
            <Link href="/terms" className="hover:text-primary transition-colors duration-200">Terms</Link>
            <Link href="/eula" className="hover:text-primary transition-colors duration-200">Agent Licence</Link>
            <Link href="/accessibility" className="hover:text-primary transition-colors duration-200">Accessibility</Link>
            <Link href="/" className="hover:text-primary transition-colors duration-200">Home</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
