'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Return to the top of a long page.
 *
 * Appears only once there is enough scrolled past to make it useful — a button
 * offering to take you to the top of a page you are already near the top of is
 * noise.
 *
 * It moves focus to the document body afterwards rather than only scrolling:
 * scrolling alone leaves a keyboard user's focus wherever it was, so the next
 * Tab jumps them straight back down the page they just left.
 */
export function BackToTop({ className }: { className?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;

    function update() {
      frame = 0;
      // A little over one viewport, so it never appears on a short page.
      setVisible(window.scrollY > window.innerHeight * 1.5);
    }

    function onScroll() {
      if (frame === 0) frame = requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  function toTop() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });

    // Put focus somewhere sensible at the top. The skip link is the first
    // focusable thing on these pages and is exactly where a keyboard user
    // wants to land.
    const target = document.querySelector<HTMLElement>('a[href="#main"], a[href="#main-content"]');
    target?.focus({ preventScroll: true });
  }

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      // Hidden from the tab order and the accessibility tree while off-screen,
      // so nobody tabs onto a button they cannot see.
      //
      // A plain boolean: React 19 handles `inert` natively. Passing an empty
      // string (the pre-19 idiom) now logs "Received an empty string for a
      // boolean attribute" and is treated as FALSE — the opposite of intent.
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        'fixed right-4 z-fab print:hidden',
        // Clears the mobile bottom bar and the sticky CTA on small screens.
        'bottom-above-nav md:bottom-6',
        'inline-flex h-11 w-11 items-center justify-center rounded-full',
        'border border-border bg-card/95 backdrop-blur-md text-muted-foreground',
        'shadow-lg hover:text-primary hover:border-primary/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'transition-[opacity,transform,color,border-color] duration-200 cursor-pointer',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
        className,
      )}
    >
      <ArrowUp className="h-4 w-4" aria-hidden />
    </button>
  );
}
