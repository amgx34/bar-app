'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { DEMO_COOKIE } from '@/lib/demo/constants';
import { demoTimeLeft } from '@/lib/demo/time-left';

/**
 * Sits in normal flow above the header (never fixed), so it cannot cover the
 * bottom nav or the floating action button. Shows no figures.
 */
export function DemoBanner({ createdAt }: { createdAt: string | null | undefined }) {
  // Remembers that this browser had a demo, so the login screen can say why it ended.
  useEffect(() => {
    document.cookie = `${DEMO_COOKIE}=1; path=/; max-age=${7 * 86400}; samesite=lax`;
  }, []);

  const left = demoTimeLeft(createdAt, new Date());
  const text = left?.expired
    ? 'This demo has ended. Your sample data is being deleted.'
    : left?.urgent
      ? `This demo ends in ${left.label}. Keep your settings before it does.`
      : 'You are looking at sample data. It is deleted after 24 hours.';

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 text-sm ${
        left?.urgent ? 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100' : 'bg-muted text-foreground'
      }`}
    >
      <p suppressHydrationWarning>{text}</p>
      <Link
        href="/signup?from=demo"
        className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground"
      >
        Make this my bar
      </Link>
    </div>
  );
}
