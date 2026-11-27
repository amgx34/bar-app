import Link from 'next/link';

/**
 * Sits in normal flow above the header (never fixed), so it cannot cover the
 * bottom nav or the floating action button. The sample bars never expire.
 */
export function DemoBanner() {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-muted px-4 py-2 text-sm text-foreground"
    >
      <p>Sample bar, nothing here changes.</p>
      <Link
        href="/signup?from=demo"
        className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground"
      >
        Make this my bar
      </Link>
    </div>
  );
}
