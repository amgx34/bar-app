'use client';

import { useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { businessDateFromParts } from '@/lib/business-date';

/**
 * Supplies the bar's own clock to a server that only ever sees UTC.
 *
 * On Vercel `new Date()` on the server is 4-8 hours ahead of every US bar this
 * app serves, so neither "which night is tonight" nor "how far into the night
 * are we" can be decided server-side. This component reads the browser's wall
 * clock — which genuinely is the bar's clock, per the same idiom as
 * payroll-tab.tsx's `new Date()` — and stamps it onto the URL as `start`/`end`
 * (the business date, via the same cutoff-hour rule `lib/business-date.ts`
 * applies everywhere else) and `hour` (the raw clock hour `lib/pos/baselines.ts`
 * needs to cut past nights off at the same point tonight has reached).
 *
 * Renders nothing. Until its first effect has run, the URL carries no `hour`
 * and the caller must treat the baseline as unknown rather than compute one
 * against the server's own hour — see the null-baseline path in live-band.tsx.
 */
export function TonightClock({ cutoffHour, active }: { cutoffHour: number; active: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!active) return;

    const now = new Date();
    const hour = now.getHours();
    const localDate = businessDateFromParts(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate(),
      hour,
      cutoffHour,
    );

    const next = new URLSearchParams(searchParams.toString());
    let changed = false;

    // Only fills in the date when the URL names none — a bare landing. It
    // never overwrites an explicit start/end, so the prev/next arrows and a
    // shared link to a specific night keep working undisturbed.
    if (!next.get('start') || !next.get('end')) {
      next.set('start', localDate);
      next.set('end', localDate);
      changed = true;
    }
    if (next.get('hour') !== String(hour)) {
      next.set('hour', String(hour));
      changed = true;
    }

    if (changed) router.replace(`${pathname}?${next.toString()}`);
  }, [active, cutoffHour, pathname, router, searchParams]);

  return null;
}
