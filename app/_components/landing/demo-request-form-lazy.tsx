'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

/**
 * Defers the demo request form out of the landing page's first-load bundle.
 *
 * The form drags in react-hook-form, zod, @hookform/resolvers, sonner, and a
 * stack of UI primitives — ~300KB raw of JS for a widget that sits in the
 * #contact section, far below the fold, and that most visitors never reach.
 *
 * This wrapper is a Client Component on purpose. Per the Next.js lazy-loading
 * guide: "When a Server Component dynamically imports a Client Component,
 * automatic code splitting is currently not supported" — so calling
 * next/dynamic straight from page.tsx would defer nothing. The dynamic import
 * has to originate from client code to actually produce a separate chunk.
 *
 * Loading is triggered by an IntersectionObserver with a generous rootMargin,
 * so the chunk is normally already fetched by the time the form scrolls into
 * view and the skeleton is never seen.
 */

const DemoRequestForm = dynamic(
  () => import('./demo-request-form').then(m => m.DemoRequestForm),
  {
    // Client-only: it's an interactive form, not indexable content, and the
    // surrounding section copy is already server-rendered.
    ssr: false,
    loading: () => <FormSkeleton />,
  },
);

/** Matches the real form's height closely enough to avoid layout shift. */
function FormSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-24 rounded bg-slate-200" />
          <div className="h-10 w-full rounded-md bg-slate-100" />
        </div>
      ))}
      <div className="h-10 w-full rounded-md bg-slate-200" />
    </div>
  );
}

export function DemoRequestFormLazy() {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show) return;
    const el = ref.current;
    if (!el) return;

    // No IntersectionObserver (old browser, jsdom): render the form anyway.
    // Deferred to a timeout rather than set synchronously here — a setState in
    // the effect body triggers a cascading re-render (react-hooks/set-state-in-effect).
    if (typeof IntersectionObserver === 'undefined') {
      const t = setTimeout(() => setShow(true), 0);
      return () => clearTimeout(t);
    }

    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      // Start fetching well before the form is actually visible.
      { rootMargin: '600px' },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [show]);

  return <div ref={ref}>{show ? <DemoRequestForm /> : <FormSkeleton />}</div>;
}
