'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { PayrollView } from '@/lib/date-range';

/**
 * Day / Week / Month, for the one Payroll screen that used to be two.
 *
 * Deliberately dumb: it takes the destination for each view rather than
 * computing one. The three views do not agree on what "the current period"
 * means — the day view holds its date in client state so the arrows stay
 * instant, while the week and month are rendered from the query string — so
 * only the caller can say where each link should go.
 */
export function PeriodToggle({
  view,
  hrefs,
}: {
  view: PayrollView;
  hrefs: Record<PayrollView, string>;
}) {
  const items: { key: PayrollView; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ];

  return (
    <div
      role="group"
      aria-label="Payroll period"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5"
    >
      {items.map(({ key, label }) => {
        const active = key === view;
        return (
          <Link
            key={key}
            href={hrefs[key]}
            aria-current={active ? 'page' : undefined}
            // min-h-8 rather than padding alone: this sits on the same row as
            // the date arrows, which are 32px, and a shorter control next to
            // them reads as a different kind of thing.
            className={cn(
              'flex min-h-8 items-center rounded-md px-3 text-sm font-medium transition-colors',
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
