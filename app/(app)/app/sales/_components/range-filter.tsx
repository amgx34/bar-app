'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { DateRange } from '@/lib/date-range';

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
] as const;

/**
 * The window every Sales screen reads.
 *
 * Links rather than a client-side filter: the range lives in the query string,
 * so it survives a refresh, can be sent to somebody, and stays put when the
 * operator moves between the three tabs. State in a component would reset on
 * every navigation and quietly show a different window than the one just read.
 */
export function RangeFilter({ range }: { range: DateRange }) {
  const pathname = usePathname();
  const params = useSearchParams();

  const href = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set('range', key);
    // Custom bounds are meaningless against a preset and would otherwise be
    // carried along and reapplied the next time custom is chosen.
    next.delete('from');
    next.delete('to');
    return `${pathname}?${next.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-lg border border-border/60 bg-card p-1">
        {PRESETS.map((p) => (
          <Link
            key={p.key}
            href={href(p.key)}
            aria-current={range.key === p.key ? 'page' : undefined}
            className={cn(
              'flex min-h-9 items-center rounded-md px-3 text-sm font-medium transition-colors',
              range.key === p.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {range.from} → {range.to}
      </span>
    </div>
  );
}
