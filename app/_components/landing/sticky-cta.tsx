'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';

/**
 * Mobile-only persistent call to action.
 *
 * On a phone the hero CTA scrolls out of view within a screen or two and the
 * next one is at the very bottom of the page, so for most of the scroll there
 * is no way to act. This keeps one available without covering content — the
 * page reserves matching padding at its foot.
 *
 * Hidden until the hero has scrolled past: showing it immediately would just
 * duplicate the button already on screen.
 */
export function StickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // A sentinel + IntersectionObserver rather than a scroll listener, so this
    // costs nothing per frame and never fights the main thread while scrolling.
    const sentinel = document.getElementById('sticky-cta-sentinel');
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Specifically "scrolled past", not merely "not visible". A sentinel
        // below the fold is also not intersecting, so on a short viewport
        // `!isIntersecting` would show the bar at page load — duplicating the
        // hero button already on screen.
        setVisible(entry.boundingClientRect.top < 0);
      },
      { rootMargin: '0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`
        md:hidden fixed inset-x-0 bottom-0 z-nav
        border-t border-border bg-card/95 backdrop-blur-md
        px-4 pt-3 pb-safe
        transition-transform duration-200
        ${visible ? 'translate-y-0' : 'translate-y-full'}
      `}
      // Removed from the tab order and the accessibility tree while off-screen,
      // so a keyboard user never lands on a button they cannot see.
      //
      // A plain boolean: React 19 handles `inert` natively. Passing an empty
      // string (the pre-19 idiom) now logs "Received an empty string for a
      // boolean attribute" and is treated as FALSE — the opposite of intent,
      // which left this panel focusable while it was off-screen.
      aria-hidden={!visible}
      inert={!visible}
    >
      <div className="flex items-center gap-3 pb-3">
        <p className="flex-1 text-xs leading-snug text-muted-foreground">
          See your own numbers in a live demo bar.
        </p>
        <a
          href="#contact"
          className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-lg bg-cta text-cta-foreground font-semibold text-sm whitespace-nowrap hover:brightness-95 transition-[filter] duration-200"
        >
          Request a demo
          <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
