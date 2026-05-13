import { Suspense } from 'react';
import { computePayroll, Employee } from './actions';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import PayrollTab from './_components/payroll-tab';
import ImportTab from './_components/import-tab';
import EmployeesTab from './_components/employees-tab';
import DaySplitTab from './_components/day-split-tab';
import DirectDepositTab from './_components/direct-deposit-tab';
import { getAllDirectDepositAccounts } from './direct-deposit-actions';

export const dynamic = 'force-dynamic';

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const tab = (params.tab as string) || 'payroll';
  const startDate = (params.startDate as string) || getDefaultStartDate();
  const endDate = (params.endDate as string) || getDefaultEndDate();

  const { org } = await getCurrentOrg();
  if (!org?.id) {
    return <div>Organization not found</div>;
  }

  const supabase = await createClient();

  // Fetch last 12 weeks of daily reports for the weekly trend chart
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
  const { data: trendDays } = await supabase
    .from('z_report_days')
    .select('report_date, total_sales, cash_tips, cc_tips')
    .eq('organization_id', org.id)
    .gte('report_date', toLocalDateStr(twelveWeeksAgo))
    .order('report_date');

  // Group by Monday of each week
  const weeklyMap = new Map<string, { sales: number; tips: number }>();
  for (const day of trendDays ?? []) {
    const monday = getMondayStr(day.report_date as string);
    if (!weeklyMap.has(monday)) weeklyMap.set(monday, { sales: 0, tips: 0 });
    const w = weeklyMap.get(monday)!;
    w.sales += day.total_sales ?? 0;
    w.tips += (day.cash_tips ?? 0) + (day.cc_tips ?? 0);
  }
  const WMONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const weeklyTrend = [...weeklyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, { sales, tips }]) => {
      const [, m, d] = iso.split('-').map(Number);
      return { weekLabel: `${WMONTHS[m - 1]} ${d}`, sales, tips };
    });

  // Fetch all employees
  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .eq('organization_id', org?.id)
    .order('name');

  // Fetch payroll data + direct deposit accounts in parallel
  const [payrollEntries, ddAccounts] = await Promise.all([
    computePayroll(startDate, endDate),
    tab === 'direct-deposit' ? getAllDirectDepositAccounts() : Promise.resolve({}),
  ]);
  const adminPhone = ((org.bar_settings ?? {}) as Record<string, unknown>).admin_phone as string | null ?? null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
        <p className="text-muted-foreground">
          Manage payroll, import reports, and configure employees
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b">
        <div className="flex gap-8">
          <TabLink
            href="/app/payroll?tab=payroll"
            active={tab === 'payroll'}
            label="Payroll"
          />
          <TabLink
            href="/app/payroll?tab=import"
            active={tab === 'import'}
            label="Import"
          />
          <TabLink
            href="/app/payroll?tab=employees"
            active={tab === 'employees'}
            label="Employees"
          />
          <TabLink
            href="/app/payroll?tab=split"
            active={tab === 'split'}
            label="Day Split"
          />
          <TabLink
            href="/app/payroll?tab=direct-deposit"
            active={tab === 'direct-deposit'}
            label="Direct Deposit"
          />
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {tab === 'payroll' && (
          <Suspense fallback={<div>Loading payroll...</div>}>
            <PayrollTab
              startDate={startDate}
              endDate={endDate}
              payrollEntries={payrollEntries}
              employees={employees || []}
              weeklyTrend={weeklyTrend}
            />
          </Suspense>
        )}

        {tab === 'import' && (
          <Suspense fallback={<div>Loading import...</div>}>
            <ImportTab />
          </Suspense>
        )}

        {tab === 'employees' && (
          <Suspense fallback={<div>Loading employees...</div>}>
            <EmployeesTab employees={employees || []} />
          </Suspense>
        )}

        {tab === 'split' && (
          <Suspense fallback={<div>Loading...</div>}>
            <DaySplitTab />
          </Suspense>
        )}

        {tab === 'direct-deposit' && (
          <Suspense fallback={<div>Loading...</div>}>
            <DirectDepositTab
              employees={employees || []}
              accountsByEmployee={ddAccounts}
              adminPhone={adminPhone}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

function TabLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <a
      href={href}
      className={`px-1 pb-4 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </a>
  );
}

function getMondayStr(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function toLocalDateStr(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getDefaultStartDate(): string {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  return toLocalDateStr(monday);
}

function getDefaultEndDate(): string {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return toLocalDateStr(sunday);
}
