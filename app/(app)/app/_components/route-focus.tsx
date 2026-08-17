'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Client-side navigation swaps the page content without moving focus, so screen
 * reader users get no signal that anything changed and keyboard focus is left
 * pointing at whatever nav item was clicked.
 *
 * On each route change this moves focus to <main>, which restarts the reading
 * order at the new content — the standard SPA equivalent of a full page load.
 * Skipped on first mount, where the browser's own load behaviour already applies.
 */
export function RouteFocus() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const main = document.getElementById('main-content');
    if (!main) return;

    main.focus();
    // Focusing mid-page would otherwise leave the viewport where it was.
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}
