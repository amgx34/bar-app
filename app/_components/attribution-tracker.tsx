'use client';

import { useEffect } from 'react';
import { captureAttribution } from '@/lib/utm';

/**
 * Records campaign parameters once per session, on the landing page.
 *
 * Renders nothing. It exists because capture has to happen on the FIRST page of
 * a visit, and the form that eventually uses the data is usually several pages
 * later — see lib/utm.ts for why first touch wins.
 */
export function AttributionTracker() {
  useEffect(() => {
    captureAttribution();
  }, []);

  return null;
}
