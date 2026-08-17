'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

/**
 * The public site's navigation on phones.
 *
 * There was none: the nav was `hidden md:flex` with nothing behind it, so below
 * 768px the links to Features, Pricing and How it works simply did not exist —
 * on the breakpoint where most of the traffic is.
 *
 * A disclosure panel rather than a full-screen overlay. The page is short and
 * the header is sticky, so covering everything to show five links would be
 * heavier than the problem.
 */
export function MobileNav({
  links,
}: {
  links: readonly (readonly [string, string])[];
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape closes and returns focus to the trigger, which is where a keyboard
  // user expects to be — not at the top of the document.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-200 cursor-pointer"
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </button>

      {/* Rendered always and hidden with `hidden`, not unmounted: an unmounted
          panel loses the open state on every resize, and `hidden` keeps it out
          of the accessibility tree and the tab order for free. */}
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-16 border-b border-border bg-card shadow-lg"
      >
        <nav aria-label="Primary" className="flex flex-col px-6 py-3">
          {links.map(([label, href]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              // 44px min target — these are thumb targets on a phone.
              className="py-3 text-sm font-medium text-muted-foreground hover:text-primary transition-colors duration-200"
            >
              {label}
            </a>
          ))}
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="py-3 text-sm font-medium text-muted-foreground hover:text-primary transition-colors duration-200 border-t border-border mt-1 pt-4"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </div>
  );
}
