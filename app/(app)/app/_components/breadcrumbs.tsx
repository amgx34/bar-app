'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { breadcrumbsFor } from './nav-config';

/**
 * Where you are, once "here" is more than one level deep.
 *
 * Renders nothing on top-level pages. A lone "Dashboard" crumb above a page
 * headed Dashboard is noise, and noise is exactly what teaches people to stop
 * reading breadcrumbs at all — so they appear only where they answer something,
 * which since the Inventory split is Inventory / Setup and the Payroll routes.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const trail = breadcrumbsFor(pathname);

  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="border-b border-border/60 bg-card px-5 py-2">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {trail.map((crumb, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={crumb.href} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden />}
              {last ? (
                // The current page is not a link. Linking it invites a click
                // that does nothing, which reads as a broken control.
                <span className="font-medium text-foreground" aria-current="page">
                  {crumb.breadcrumb ?? crumb.label}
                </span>
              ) : (
                // The negative margin is what keeps this honest: the crumb needs
                // a 36px touch target on a phone (as inline text it measured
                // 16px), but a 36px-tall row of 12px text reads as a banner.
                // Padding grows the hit area, the margin gives the space back.
                <Link
                  href={crumb.href}
                  className="-my-2 inline-flex min-h-9 items-center py-2 transition-colors hover:text-foreground"
                >
                  {crumb.breadcrumb ?? crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
