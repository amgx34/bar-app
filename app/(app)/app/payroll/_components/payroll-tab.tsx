'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PayrollEntry, Employee } from '../actions';
import PayrollTable from './payroll-table';
import { AddToShiftDialog } from './add-to-shift-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Clock, DollarSign, TrendingUp, Banknote, Wallet, ChevronLeft, ChevronRight, AlertTriangle, BarChart2, ChevronDown, Upload, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WeeklyPoint } from './weekly-trend-chart';
import ZReportTextUpload from './z-report-text-upload';
import EmployeeShiftsUpload from './employee-shifts-upload';
import { PeriodToggle } from './period-toggle';
import { defaultPeriod, monthRange, shiftPeriod, todayIso, type PayrollView } from '@/lib/date-range';

const WeeklyTrendChart = dynamic(() => import('./weekly-trend-chart'));

interface PayrollTabProps {
  /** 'week' or 'month'. The day view is the tip split, not this table. */
  view: PayrollView;
  startDate: string;
  endDate: string;
  /** Owner/manager may correct hours and move tips; others see the run read-only. */
  canAdjust?: boolean;
  payrollEntries: PayrollEntry[];
  employees: Employee[];
  weeklyTrend: WeeklyPoint[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * What the navigator calls the period on screen.
 *
 * A month is named, not described: "Aug 1 – Aug 31, 2026" is the same
 * information as "August 2026" and reads as an arbitrary range rather than
 * the month it actually is.
 */
function formatPeriodLabel(view: PayrollView, start: string, end: string): string {
  if (view === 'month') {
    const [y, m] = start.split('-').map(Number);
    return `${MONTHS_LONG[m - 1]} ${y}`;
  }
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const sStr = `${MONTHS[s.getMonth()]} ${s.getDate()}`;
  const eStr = `${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  return `${sStr} – ${eStr}`;
}

export default function PayrollTab({
  view,
  startDate,
  endDate,
  payrollEntries,
  employees,
  weeklyTrend,
  canAdjust = false,
}: PayrollTabProps) {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [addShiftOpen, setAddShiftOpen] = useState(false);

  const unconfiguredEmployees = employees.filter((e) => !e.role || e.hourly_rate === null);

  const totals = payrollEntries.reduce(
    (acc, entry) => ({
      totalHours: acc.totalHours + entry.totalHours,
      regularPay: acc.regularPay + entry.regularPay,
      overtimePay: acc.overtimePay + entry.overtimePay,
      tips: acc.tips + entry.tipAmount,
      totalCompensation: acc.totalCompensation + entry.totalCompensation,
    }),
    { totalHours: 0, regularPay: 0, overtimePay: 0, tips: 0, totalCompensation: 0 }
  );

  function navigatePeriod(dir: 'prev' | 'next') {
    // Not `addDays(±7)` any more: stepping a month that way lands in the wrong
    // month from the 29th onward. shiftPeriod knows which kind it is stepping.
    const { start, end } = shiftPeriod(view, startDate, endDate, dir);
    router.push(`/app/payroll?view=${view}&startDate=${start}&endDate=${end}`);
  }

  const periodNoun = view === 'month' ? 'month' : 'week';

  // Which night the Day view opens on when you switch to it. Today when today
  // is inside the range you are looking at, otherwise the first of it — landing
  // on today while browsing March would throw away the period you had chosen.
  const today = todayIso();
  const dayAnchor = today >= startDate && today <= endDate ? today : startDate;
  const otherWeek = defaultPeriod('week', dayAnchor);
  const otherMonth = monthRange(dayAnchor);
  const hrefs: Record<PayrollView, string> = {
    day: `/app/payroll?view=day&date=${dayAnchor}`,
    week: `/app/payroll?view=week&startDate=${otherWeek.start}&endDate=${otherWeek.end}`,
    month: `/app/payroll?view=month&startDate=${otherMonth.start}&endDate=${otherMonth.end}`,
  };

  return (
    <div className="space-y-6">
      {unconfiguredEmployees.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/60 dark:bg-yellow-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {unconfiguredEmployees.length} employee{unconfiguredEmployees.length > 1 ? 's' : ''} need configuration
            </p>
            <p className="mt-0.5 text-sm text-yellow-700 dark:text-yellow-300 truncate">
              {unconfiguredEmployees.map((e) => e.name).join(', ')}
            </p>
          </div>
          <Link
            href="/app/payroll/employees"
            className="shrink-0 text-sm font-medium text-yellow-900 underline underline-offset-2 hover:text-yellow-700 dark:text-yellow-100 dark:hover:text-yellow-50"
          >
            Configure →
          </Link>
        </div>
      )}

      {/* Weekly revenue trend */}
      {weeklyTrend.length > 1 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-muted-foreground" />
              Weekly Revenue — Last {weeklyTrend.length} Weeks
            </h2>
          </div>
          <div className="px-5 py-4 h-52">
            <WeeklyTrendChart data={weeklyTrend} />
          </div>
        </div>
      )}

      {/* Week navigator.
          Wraps on a phone: the arrows-and-label group and the date form are
          each about 200-370px, so side by side they forced the page wider than
          the viewport and the whole of Payroll scrolled sideways. */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <PeriodToggle view={view} hrefs={hrefs} />

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label={`Previous ${periodNoun}`} onClick={() => navigatePeriod('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[170px] text-center">
              {formatPeriodLabel(view, startDate, endDate)}
            </span>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label={`Next ${periodNoun}`} onClick={() => navigatePeriod('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Manual date picker.
            Two native date inputs are ~143px each on a phone, so the old
            single-line flex measured 368px inside a 375px viewport and pushed
            the whole document to 682px wide — the entire payroll page scrolled
            sideways. It wraps now, and the inputs share the row so the pair
            still reads as one range. */}
        {/* Keyed on the range so the inputs remount when it changes.
            They are uncontrolled, and a client navigation between views does
            not re-mount the component — so switching Week to Month left the
            boxes showing the week's dates next to a heading that said August,
            and pressing Go silently reverted you to the week. */}
        <form
          key={`${startDate}:${endDate}`}
          method="GET"
          className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
        >
          <input
            type="date"
            name="startDate"
            defaultValue={startDate}
            aria-label="Start date"
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm sm:flex-none"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <input
            type="date"
            name="endDate"
            defaultValue={endDate}
            aria-label="End date"
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm sm:flex-none"
          />
          <input type="hidden" name="view" value={view} />
          <Button type="submit" size="sm" variant="secondary">
            Go
          </Button>
        </form>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-l-4 border-l-indigo-600 dark:border-l-indigo-400">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Total Hours
            </CardTitle>
            <Clock className="h-4 w-4 text-indigo-700 dark:text-indigo-300" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold tabular-nums">{totals.totalHours.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">hrs this {periodNoun}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600 dark:border-l-emerald-400">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Regular Pay
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold tabular-nums">${totals.regularPay.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-600 dark:border-l-amber-400">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Overtime Pay
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-amber-700 dark:text-amber-300" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold tabular-nums">${totals.overtimePay.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-cyan-600 dark:border-l-cyan-400">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tips
            </CardTitle>
            <Banknote className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold tabular-nums">${totals.tips.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Total Pay
            </CardTitle>
            <Wallet className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold tabular-nums text-primary">
              ${totals.totalCompensation.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {canAdjust && (
        <div className="flex justify-end">
          {/* Somebody who never clocked in has no payroll row, so there is no
              row-level control that could reach them. */}
          <Button variant="outline" size="sm" onClick={() => setAddShiftOpen(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4" aria-hidden />
            Add someone to a shift
          </Button>
        </div>
      )}

      <PayrollTable
        entries={payrollEntries}
        totals={totals}
        startDate={startDate}
        endDate={endDate}
        canAdjust={canAdjust}
      />

      {canAdjust && addShiftOpen && (
        <AddToShiftDialog
          open={addShiftOpen}
          onOpenChange={setAddShiftOpen}
          startDate={startDate}
          endDate={endDate}
        />
      )}

      {/* ── Quick Import ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border overflow-hidden">
        <button
          onClick={() => setImportOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 bg-card hover:bg-muted/40 transition-colors text-left"
        >
          <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold flex-1">Import Data</span>
          <span className="text-xs text-muted-foreground mr-2">Z Report · Employee Shifts</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform duration-300',
              importOpen && 'rotate-180'
            )}
          />
        </button>

        <div
          className="overflow-hidden transition-all duration-350 ease-in-out"
          style={{ maxHeight: importOpen ? '800px' : '0px', opacity: importOpen ? 1 : 0 }}
        >
          <div className="grid gap-6 md:grid-cols-2 px-5 py-5 border-t">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Daily Z Report</p>
              <ZReportTextUpload />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Employee Shifts</p>
              <EmployeeShiftsUpload />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
