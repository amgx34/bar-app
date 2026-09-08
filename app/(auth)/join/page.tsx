import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { JoinForm } from './join-form';

export const metadata: Metadata = {
  title: 'Staff sign-up',
  // Nothing to rank for, and indexing it would put a bar's staff sign-up in
  // search results. Still followable so crawlers can walk back out.
  robots: { index: false, follow: true },
};

export default function JoinPage() {
  return (
    <main className="relative min-h-dvh grid place-items-center p-6 overflow-hidden bg-sidebar text-sidebar-foreground">
      <div aria-hidden className="absolute inset-0 grid-texture text-sidebar-foreground opacity-40" />
      <div
        aria-hidden
        className="absolute -top-32 left-1/2 -translate-x-1/2 h-[26rem] w-[26rem] rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--primary), transparent 70%)' }}
      />
      <div className="relative z-10 w-full flex flex-col items-center gap-6">
        <h1 className="sr-only">Staff sign-up</h1>
        <p aria-hidden="true" className="font-heading text-sidebar-foreground/60 text-xs font-bold tracking-[0.3em] uppercase select-none">
          Rail
        </p>

        <JoinForm />

        <Link
          href="/login"
          className="flex items-center gap-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors duration-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Already have a login?
        </Link>
      </div>
    </main>
  );
}
