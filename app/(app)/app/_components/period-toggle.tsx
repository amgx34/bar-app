'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * A period switcher, shared by Payroll and Sales.
 *
 * Deliberately dumb: it takes the destination for each view rather than
 * computing one. The views do not agree on what "the current period" means —
 * Payroll's day view holds its date in client state so the arrows stay
 * instant, while the week and month are rendered from the query string — so
 * only the caller can say where each link should go.
 *
 * Generic over the view type so Sales can add `tonight` without Payroll
 * gaining a period it does not have.
 */
export function PeriodToggle<T extends string>({
  view,
  items,
  hrefs,
}: {
  view: T;
  items: { key: T; label: string }[];
  hrefs: Record<T, string>;
}) {
  return (
    <div
      role="group"
      aria-label="Period"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5"
    >
      {items.map(({ key, label }) => {
        const active = key === view;
        return (
          <Link
            key={key}
            href={hrefs[key]}
            aria-current={active ? 'page' : undefined}
            // 44px touch target.
            className={cn(
              'flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
