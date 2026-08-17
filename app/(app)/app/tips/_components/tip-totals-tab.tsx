'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Banknote, BarChart2, TrendingUp } from 'lucide-react';

interface DailyBreakdown {
  date: string;
  sales: number;
  tips: number;
  tipPct: number;
}

interface TipTotalsTabProps {
  startDate: string;
  endDate: string;
  weekTotal: number;
  weekSales: number;
  weekAvgTipPct: number;
  dailyBreakdown: DailyBreakdown[];
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
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return `${months[s.getMonth()]} ${s.getDate()} – ${months[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
}

function fmtDate(iso: string): string {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(iso + 'T00:00:00');
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}

export default function TipTotalsTab({
  startDate,
  endDate,
  weekTotal,
  weekSales,
  weekAvgTipPct,
  dailyBreakdown,
}: TipTotalsTabProps) {
  const router = useRouter();

  function navigateWeek(dir: 'prev' | 'next') {
    const delta = dir === 'prev' ? -7 : 7;
    const newStart = addDays(startDate, delta);
    const newEnd = addDays(endDate, delta);
    router.push(`/app/tips?tab=totals&startDate=${newStart}&endDate=${newEnd}`);
  }

  const maxTips = dailyBreakdown.length > 0 ? Math.max(...dailyBreakdown.map(d => d.tips)) : 1;

  return (
    <div className="space-y-6">
      {/* Week navigator */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => navigateWeek('prev')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium min-w-[190px] text-center">
          {formatWeekLabel(startDate, endDate)}
        </span>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => navigateWeek('next')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-l-4 border-l-cyan-600 dark:border-l-cyan-400">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Week Tips
            </CardTitle>
            <Banknote className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold tabular-nums">${weekTotal.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">{dailyBreakdown.length} nights</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600 dark:border-l-emerald-400">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Week Sales
            </CardTitle>
            <BarChart2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold tabular-nums">${weekSales.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Avg Tip %
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold tabular-nums text-primary">
              {(weekAvgTipPct * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily breakdown */}
      {dailyBreakdown.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <p className="text-muted-foreground">No Z report data for this week</p>
          <p className="text-sm text-muted-foreground mt-1">
            Import daily Z reports to see per-night totals.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Sales</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Tips</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Tip %</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-40">
                  Relative
                </th>
              </tr>
            </thead>
            <tbody>
              {dailyBreakdown.map((day, i) => (
                <tr key={day.date} className={i % 2 === 1 ? 'bg-muted/20' : ''}>
                  <td className="px-4 py-3 font-medium">{fmtDate(day.date)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    ${day.sales.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-cyan-700 dark:text-cyan-300">
                    ${day.tips.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {(day.tipPct * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${maxTips > 0 ? (day.tips / maxTips) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/40 font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  ${weekSales.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-cyan-700 dark:text-cyan-300">
                  ${weekTotal.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-primary">
                  {(weekAvgTipPct * 100).toFixed(1)}%
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
