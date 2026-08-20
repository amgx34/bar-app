import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import AnalyticsTab from './_components/analytics-tab';
import TipTotalsTab from './_components/tip-totals-tab';
import FlagsTab, { ServerTipStats } from './_components/flags-tab';
import WellPerformanceTab from './_components/well-performance-tab';

export const dynamic = 'force-dynamic';

// ── Date helpers ─────────────────────────────────────────────────────────────

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

// ── Main page ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = { title: 'Tips' };

export default async function TipsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const tab = (params.tab as string) || 'analytics';
  const startDate = (params.startDate as string) || getDefaultStartDate();
  const endDate = (params.endDate as string) || getDefaultEndDate();

  const { org } = await getCurrentOrg();
  if (!org?.id) return <div>Organization not found</div>;

  const supabase = await createClient();

  // Fetch all-time Z report days (for analytics averages)
  const { data: allDayReports } = await supabase
    .from('z_report_days')
    .select('report_date, total_sales, cash_tips, cc_tips')
    .eq('organization_id', org.id)
    .order('report_date', { ascending: false });

  // Fetch all-time per-server tips (for flags)
  const { data: allServerTips } = await supabase
    .from('z_report_server_tips')
    .select('report_date, employee_name, total_sales, tips_paid_out')
    .eq('organization_id', org.id);

  // Fetch selected week's day reports (for tip totals tab)
  const { data: weekDayReports } = await supabase
    .from('z_report_days')
    .select('report_date, total_sales, cash_tips, cc_tips')
    .eq('organization_id', org.id)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .order('report_date');

  // ── Analytics computation ─────────────────────────────────────────────────

  const validDays = (allDayReports || []).filter((d) => d.total_sales > 0);

  const avgNightlyTipPct =
    validDays.length > 0
      ? validDays.reduce(
          (sum, d) => sum + (d.cash_tips + d.cc_tips) / d.total_sales,
          0
        ) / validDays.length
      : 0;

  const recentDay = allDayReports?.[0] ?? null;
  const recentTipTotal = recentDay ? recentDay.cash_tips + recentDay.cc_tips : 0;
  const recentSales = recentDay?.total_sales ?? 0;
  const recentTipPct = recentSales > 0 ? recentTipTotal / recentSales : 0;

  // ── Flags computation ────────────────────────────────────────────────────

  const serverTipRows = (allServerTips || []).filter((r) => r.total_sales > 0);

  // Population of all nightly per-server tip percentages
  const allTipPcts = serverTipRows.map((r) => r.tips_paid_out / r.total_sales);

  const popMean =
    allTipPcts.length > 0
      ? allTipPcts.reduce((s, v) => s + v, 0) / allTipPcts.length
      : 0;

  const popVariance =
    allTipPcts.length > 1
      ? allTipPcts.reduce((s, v) => s + (v - popMean) ** 2, 0) / allTipPcts.length
      : 0;

  const popStdDev = Math.sqrt(popVariance);
  const flagThreshold = popMean + 2 * popStdDev;

  // Group by server name
  const byServer = new Map<
    string,
    { shifts: number; totalSales: number; totalTips: number; tipPcts: number[] }
  >();

  for (const row of serverTipRows) {
    const name: string = row.employee_name;
    const tipPct = row.tips_paid_out / row.total_sales;
    if (!byServer.has(name)) {
      byServer.set(name, { shifts: 0, totalSales: 0, totalTips: 0, tipPcts: [] });
    }
    const s = byServer.get(name)!;
    s.shifts++;
    s.totalSales += row.total_sales;
    s.totalTips += row.tips_paid_out;
    s.tipPcts.push(tipPct);
  }

  const serverStats: ServerTipStats[] = Array.from(byServer.entries())
    .map(([name, data]) => {
      const avgTipPct =
        data.tipPcts.reduce((s, v) => s + v, 0) / data.tipPcts.length;
      return {
        name,
        shifts: data.shifts,
        totalSales: data.totalSales,
        totalTips: data.totalTips,
        avgTipPct,
        flagged: avgTipPct > flagThreshold,
      };
    })
    .sort((a, b) => b.avgTipPct - a.avgTipPct);

  const flaggedCount = serverStats.filter((s) => s.flagged).length;

  // ── Tip totals computation ────────────────────────────────────────────────

  const weekTotal = (weekDayReports || []).reduce(
    (s, d) => s + d.cash_tips + d.cc_tips,
    0
  );
  const weekSales = (weekDayReports || []).reduce((s, d) => s + d.total_sales, 0);

  const validWeekDays = (weekDayReports || []).filter((d) => d.total_sales > 0);
  const weekAvgTipPct =
    validWeekDays.length > 0
      ? validWeekDays.reduce(
          (sum, d) => sum + (d.cash_tips + d.cc_tips) / d.total_sales,
          0
        ) / validWeekDays.length
      : 0;

  const dailyBreakdown = (weekDayReports || []).map((d) => ({
    date: d.report_date,
    sales: d.total_sales,
    tips: d.cash_tips + d.cc_tips,
    tipPct: d.total_sales > 0 ? (d.cash_tips + d.cc_tips) / d.total_sales : 0,
  }));

  // ─────────────────────────────────────────────────────────────────────────

  const tabs = [
    { key: 'analytics', label: 'Analytics' },
    { key: 'totals', label: 'Tip Totals' },
    { key: 'flags', label: `Flags${flaggedCount > 0 ? ` (${flaggedCount})` : ''}` },
    { key: 'well', label: 'Well Performance' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tips</h1>
        <p className="text-muted-foreground">
          Analytics, totals, and anomaly detection for tip distribution
        </p>
      </div>

      {/* Tab navigation */}
      {/* Scrolls rather than spilling. With a plain `flex gap-8` the last tab
          ran past a 320px screen with no scroller to reach it — on Tips that
          hid "Well Performance" entirely. Same treatment as Settings. */}
      <div className="border-b overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-6 min-w-max">
          {tabs.map(({ key, label }) => (
            <a
              key={key}
              href={`/app/tips?tab=${key}${key === 'totals' ? `&startDate=${startDate}&endDate=${endDate}` : ''}`}
              className={`px-1 pb-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {tab === 'analytics' && (
          <AnalyticsTab
            avgNightlyTipPct={avgNightlyTipPct}
            recentDate={recentDay?.report_date ?? null}
            recentTipTotal={recentTipTotal}
            recentSales={recentSales}
            recentTipPct={recentTipPct}
            flaggedCount={flaggedCount}
            totalNightsTracked={validDays.length}
            nightlyHistory={(allDayReports ?? []).slice(0, 30).reverse().map((d) => ({
              date: d.report_date as string,
              tipPct: d.total_sales > 0 ? (d.cash_tips + d.cc_tips) / d.total_sales : 0,
              sales: d.total_sales as number,
            }))}
          />
        )}

        {tab === 'totals' && (
          <TipTotalsTab
            startDate={startDate}
            endDate={endDate}
            weekTotal={weekTotal}
            weekSales={weekSales}
            weekAvgTipPct={weekAvgTipPct}
            dailyBreakdown={dailyBreakdown}
          />
        )}

        {tab === 'flags' && (
          <FlagsTab
            serverStats={serverStats}
            populationMean={popMean}
            populationStdDev={popStdDev}
          />
        )}

        {tab === 'well' && <WellPerformanceTab />}
      </div>
    </div>
  );
}
