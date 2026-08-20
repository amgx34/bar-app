'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { sectionFor, isActive, type NavLink } from './nav-config';

/**
 * One local tab strip, shared by every section that has one.
 *
 * Replaces three hand-rolled implementations: two inventory strips that
 * rendered simultaneously and listed different tabs, and an inline one in
 * Payroll. Reading from nav-config means a section's tabs cannot disagree with
 * the sidebar's sub-items again.
 *
 * Rendered from the section LAYOUT rather than each page, so it does not
 * re-mount on navigation and cannot be double-rendered by a page that also
 * includes it.
 */
export function SectionTabs({ tabs }: { tabs?: NavLink[] }) {
  const pathname = usePathname();
  const section = sectionFor(pathname);
  const items = tabs ?? section?.tabs;

  if (!items?.length) return null;

  return (
    <nav
      aria-label={`${section?.root.label ?? 'Section'} sections`}
      className="border-b border-border/60 bg-card"
    >
      {/* Scrolls rather than wraps: five tabs do not fit 375px, and a wrapped
          strip stops reading as one control. The scrollbar is hidden because a
          horizontal bar under a tab row reads as a broken layout. */}
      <div className="flex overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map(({ label, href }, index) => {
          // The first tab IS the section root, so it must match exactly —
          // otherwise it stays active on every child route and two tabs light
          // up at once.
          const active = isActive(href, pathname, index === 0);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors duration-200',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
