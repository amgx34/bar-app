import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { computePayroll } from './actions';
import { getCurrentOrg } from '@/lib/org';
import { canManagePayroll } from '@/lib/permissions';
import PayrollTab from './_components/payroll-tab';
import {
  defaultWeek,
  loadEmployees,
  loadWeeklyTrend,
  LEGACY_TAB_ROUTES,
} from './_shared';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Pay Run' };

export default async function PayRunPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  // The tabs used to be `?tab=` on this one route. Anything already bookmarked
  // or pasted into a message keeps working instead of silently landing here.
  const legacyTab = typeof params.tab === 'string' ? params.tab : null;
  if (legacyTab && LEGACY_TAB_ROUTES[legacyTab]) {
    redirect(LEGACY_TAB_ROUTES[legacyTab]);
  }

  const week = defaultWeek();
  const startDate = (params.startDate as string) || week.start;
  const endDate = (params.endDate as string) || week.end;

  const { org, role } = await getCurrentOrg();
  if (!org?.id) return <div className="p-6">Organization not found</div>;

  const [employees, weeklyTrend, payrollEntries] = await Promise.all([
    loadEmployees(),
    loadWeeklyTrend(),
    computePayroll(startDate, endDate),
  ]);

  return (
    <div className="p-5 sm:p-6">
      <Suspense fallback={<div>Loading payroll…</div>}>
        <PayrollTab
          startDate={startDate}
          endDate={endDate}
          payrollEntries={payrollEntries}
          employees={employees as never}
          weeklyTrend={weeklyTrend}
          canAdjust={canManagePayroll(role)}
        />
      </Suspense>
    </div>
  );
}
