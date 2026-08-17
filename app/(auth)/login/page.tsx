import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { LoginForm } from './login-form';
import { DemoButton } from '@/app/_components/landing/demo-button';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Sign in',
  // A login form has nothing to rank for, and indexing it just gives searchers
  // a dead end. Still followable so crawlers can walk back to the marketing page.
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh grid place-items-center p-6 overflow-hidden bg-sidebar text-sidebar-foreground">
      {/* Same hairline data-grid motif as the marketing hero, so signing in
          feels continuous with the site. Replaces a 1920px external photo. */}
      <div aria-hidden className="absolute inset-0 grid-texture text-sidebar-foreground opacity-40" />
      <div
        aria-hidden
        className="absolute -top-32 left-1/2 -translate-x-1/2 h-[26rem] w-[26rem] rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--primary), transparent 70%)' }}
      />
      <div className="relative z-10 w-full flex flex-col items-center gap-6">
        {/* The page's real heading. Visually hidden because the design leads
            with the card's own "Log in" title, but the document still needs
            exactly one h1 for assistive tech and crawlers. */}
        <h1 className="sr-only">Sign in to Rail</h1>
        <p aria-hidden="true" className="font-heading text-sidebar-foreground/60 text-xs font-bold tracking-[0.3em] uppercase select-none">
          Rail
        </p>
        <Suspense>
          <LoginForm />
        </Suspense>

        {/* Back to home + demo */}
        <div className="flex flex-col items-center gap-3">
          {/* Was a <Link> to /api/demo — that route is POST-only now, so the
              shared button owns the request and its error states. */}
          <DemoButton
            className="border-sidebar-border !text-sidebar-foreground hover:!bg-sidebar-accent hover:!text-sidebar-foreground"
          />
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors duration-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to home
          </Link>
        </div>

        <p className="text-sidebar-foreground/45 text-[11px]">
          &copy; {new Date().getFullYear()} All rights reserved
        </p>
      </div>
    </main>
  );
}
