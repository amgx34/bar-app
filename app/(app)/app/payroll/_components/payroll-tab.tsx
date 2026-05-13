'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PayrollEntry, Employee } from '../actions';
import PayrollTable from './payroll-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Clock, DollarSign, TrendingUp, Banknote, Wallet, ChevronLeft, ChevronRight, AlertTriangle, BarChart2, ChevronDown, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WeeklyPoint } from './weekly-trend-chart';
import ZReportTextUpload from './z-report-text-upload';
import EmployeeShiftsUpload from './employee-shifts-upload';

const WeeklyTrendChart = dynamic(() => import('./weekly-trend-chart'));

interface PayrollTabProps {
  startDate: string;
  endDate: string;
  payrollEntries: PayrollEntry[];
  employees: Employee[];
  weeklyTrend: WeeklyPoint[];
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatWeekLabel(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const sStr = `${months[s.getMonth()]} ${s.getDate()}`;
  const eStr = `${months[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  return `${sStr} – ${eStr}`;
}

export default function PayrollTab({
  startDate,
  endDate,
  payrollEntries,
  employees,
  weeklyTrend,
}: PayrollTabProps) {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);

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

  function navigateWeek(dir: 'prev' | 'next') {
    const delta = dir === 'prev' ? -7 : 7;
    const newStart = addDays(startDate, delta);
    const newEnd = addDays(endDate, delta);
    router.push(`/app/payroll?tab=payroll&startDate=${newStart}&endDate=${newEnd}`);
  }

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
            href="/app/payroll?tab=employees"
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

      {/* Week navigator */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => navigateWeek('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[170px] text-center">
            {formatWeekLabel(startDate, endDate)}
          </span>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => navigateWeek('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Manual date picker */}
        <form method="GET" className="flex items-center gap-2">
          <input
            type="date"
            name="startDate"
            defaultValue={startDate}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <input
            type="date"
            name="endDate"
            defaultValue={endDate}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <input type="hidden" name="tab" value="payroll" />
          <Button type="submit" size="sm" variant="secondary">
            Go
          </Button>
        </form>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-l-4 border-l-indigo-400">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Total Hours
            </CardTitle>
            <Clock className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold tabular-nums">{totals.totalHours.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">hrs this week</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-400">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Regular Pay
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold tabular-nums">${totals.regularPay.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-400">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Overtime Pay
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold tabular-nums">${totals.overtimePay.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-cyan-400">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tips
            </CardTitle>
            <Banknote className="h-4 w-4 text-cyan-400" />
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

      <PayrollTable entries={payrollEntries} totals={totals} />

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
