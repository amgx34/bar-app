import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { computePayroll } from './actions';
import { getCurrentOrg } from '@/lib/org';
import { canManagePayroll } from '@/lib/permissions';
import PayrollTab from './_components/payroll-tab';
import DaySplitTab from './_components/day-split-tab';
import {
  loadEmployees,
  loadWeeklyTrend,
  LEGACY_TAB_ROUTES,
} from './_shared';
import {
  defaultPeriod,
  isIsoDate,
  payPeriodFromParams,
  resolvePayrollView,
  todayIso,
} from '@/lib/date-range';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Payroll' };

/**
 * Payroll's one period screen: a night, a week, or a month.
 *
 * These were two routes — the pay run here and the tip split on
 * `/app/payroll/split` — which meant the operator's daily job and their pay-day
 * job lived on different tabs with no way to move between them on the same
 * date. They are one screen now, switched by `?view=`.
 *
 * Day defaults, because splitting one night's tips is the thing done every
 * night; the week and the month are what gets looked at once a fortnight.
 *
 * The day view loads nothing here on purpose. It fetches per-date on the
 * client, because the operator moves between nights far more often than they
 * arrive at the page, and a server round-trip per arrow press would be felt.
 */
export default async function PayrollPage({
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

  const { org, role } = await getCurrentOrg();
  if (!org?.id) return <div className="p-6">Organization not found</div>;

  const view = resolvePayrollView(params.view);
  const canAdjust = canManagePayroll(role);

  if (view === 'day') {
    // Validated, not trusted — same as the pay period below. A `?date=` off a
    // shared link flows into a date comparison, where junk produced a 500.
    const date = isIsoDate(params.date) ? params.date : undefined;

    return (
      <div className="p-5 sm:p-6">
        <Suspense fallback={<div>Loading…</div>}>
          <DaySplitTab canEdit={canAdjust} initialDate={date} />
        </Suspense>
      </div>
    );
  }

  // A URL naming no period — or naming a broken one — gets the current week or
  // month for the view it asked for, rather than an error screen.
  const { start: startDate, end: endDate } =
    payPeriodFromParams(params.startDate, params.endDate) ?? defaultPeriod(view, todayIso());

  const [employees, weeklyTrend, payrollEntries] = await Promise.all([
    loadEmployees(),
    loadWeeklyTrend(),
    computePayroll(startDate, endDate),
  ]);

  return (
    <div className="p-5 sm:p-6">
      <Suspense fallback={<div>Loading payroll…</div>}>
        <PayrollTab
          view={view}
          startDate={startDate}
          endDate={endDate}
          payrollEntries={payrollEntries}
          employees={employees as never}
          weeklyTrend={weeklyTrend}
          canAdjust={canAdjust}
        />
      </Suspense>
    </div>
  );
}
