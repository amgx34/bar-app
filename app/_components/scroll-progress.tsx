'use client';

import { useEffect, useRef } from 'react';

/**
 * Reading-progress bar for long documents.
 *
 * Written straight to the DOM through a ref rather than through state: this
 * updates on every scroll frame, and putting that through React would re-render
 * the whole page tree sixty times a second to move one element.
 *
 * Purely decorative, so it is aria-hidden. A screen reader gets no value from a
 * percentage it cannot act on, and announcing it on every scroll would be
 * actively hostile.
 */
export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    // Someone who has asked for reduced motion has asked not to have things
    // sliding in their peripheral vision while they read.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return;

    let frame = 0;

    function update() {
      frame = 0;
      const doc = document.documentElement;
      // How far there is to scroll, not how tall the page is.
      const scrollable = doc.scrollHeight - doc.clientHeight;
      // A page shorter than the viewport has no progress to report; showing a
      // full bar on a page that cannot scroll reads as a stuck loading bar.
      const ratio = scrollable > 0 ? doc.scrollTop / scrollable : 0;
      bar!.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
    }

    function onScroll() {
      // Coalesce to one write per frame — scroll fires far more often than the
      // screen refreshes.
      if (frame === 0) frame = requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-nav-top h-0.5 print:hidden pointer-events-none"
    >
      <div
        ref={barRef}
        className="h-full w-full origin-left scale-x-0 bg-primary"
      />
    </div>
  );
}
