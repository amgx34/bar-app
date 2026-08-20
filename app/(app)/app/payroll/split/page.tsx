import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getCurrentOrg } from '@/lib/org';
import { canManagePayroll } from '@/lib/permissions';
import DaySplitTab from '../_components/day-split-tab';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Day Split' };

/**
 * Splitting one night's tips between the people who worked it.
 *
 * Loads nothing here: the component fetches per-date on the client, because the
 * operator moves between nights far more often than they arrive at the page.
 */
export default async function DaySplitPage() {
  const { role } = await getCurrentOrg();

  return (
    <div className="p-5 sm:p-6">
      <Suspense fallback={<div>Loading…</div>}>
        <DaySplitTab canEdit={canManagePayroll(role)} />
      </Suspense>
    </div>
  );
}
