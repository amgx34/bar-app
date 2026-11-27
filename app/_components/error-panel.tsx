'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { errorHome } from '@/lib/nav/error-home';
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';

// Shared by app/error.tsx and app/(app)/app/error.tsx. Never prints error.message:
// in dev it can carry internals, in prod it is generic. The digest is the only
// thing shown, as a small reference code a bar can read to support.
export function ErrorPanel({
  error,
  onRetry,
  fill,
}: {
  error: Error & { digest?: string };
  onRetry: () => void;
  fill?: boolean;
}) {
  const home = errorHome(usePathname());
  return (
    <main className={`${fill ? 'min-h-dvh' : 'min-h-[60dvh]'} bg-background text-foreground flex items-center justify-center px-6 py-10`}>
      <div role="alert" className="max-w-md text-center">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Something went wrong on our end</h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          This page did not load. Nothing you entered has been lost. Try again, and if it keeps happening, use the other button to start over.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center h-11 min-w-11 px-6 rounded-xl bg-primary text-primary-foreground font-semibold w-full sm:w-auto"
          >
            Try again
          </button>
          <Link
            href={home.href}
            className="inline-flex items-center justify-center h-11 min-w-11 px-6 rounded-xl border border-border-strong font-semibold w-full sm:w-auto"
          >
            {home.label}
          </Link>
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          Still stuck? Email{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="underline">{LEGAL_CONTACT_EMAIL}</a>.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-muted-foreground">Reference code: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
