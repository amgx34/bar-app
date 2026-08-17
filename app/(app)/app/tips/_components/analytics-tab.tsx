'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Banknote, BarChart2, AlertTriangle, Calendar } from 'lucide-react';
import type { NightlyPoint } from './nightly-tip-chart';

const NightlyTipChart = dynamic(() => import('./nightly-tip-chart'));

interface AnalyticsTabProps {
  avgNightlyTipPct: number;
  recentDate: string | null;
  recentTipTotal: number;
  recentSales: number;
  recentTipPct: number;
  flaggedCount: number;
  totalNightsTracked: number;
  nightlyHistory: NightlyPoint[];
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}

export default function AnalyticsTab({
  avgNightlyTipPct,
  recentDate,
  recentTipTotal,
  recentSales,
  recentTipPct,
  flaggedCount,
  totalNightsTracked,
  nightlyHistory,
}: AnalyticsTabProps) {
  const noData = totalNightsTracked === 0;

  return (
    <div className="space-y-6">
      {noData && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground font-medium">No Z report data yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Import a daily Z report on the Payroll → Import tab to see analytics.
          </p>
        </div>
      )}

      {!noData && (
        <>
          {/* Flagged alert */}
          {flaggedCount > 0 && (
            <Link href="/app/tips?tab=flags">
              <div className="flex items-center gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 cursor-pointer hover:bg-yellow-500/15 transition-colors">
                <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-yellow-400">
                    {flaggedCount} bartender{flaggedCount > 1 ? 's' : ''} flagged for unusual tip %
                  </p>
                  <p className="text-xs text-yellow-500/80 mt-0.5">
                    Average tip % is 2+ standard deviations above the bar average — click to review
                  </p>
                </div>
                <span className="text-xs text-yellow-500 font-medium">View Flags →</span>
              </div>
            </Link>
          )}

          {/* Nightly tip % trend */}
          {nightlyHistory.length > 1 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Nightly Tip % — Last {nightlyHistory.length} Nights
                </h2>
                <span className="text-xs text-muted-foreground">avg {(avgNightlyTipPct * 100).toFixed(1)}%</span>
              </div>
              <div className="px-5 py-4 h-56">
                <NightlyTipChart data={nightlyHistory} average={avgNightlyTipPct} />
              </div>
            </div>
          )}

          {/* Metric cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-l-4 border-l-primary">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Avg Nightly Tip %
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold tabular-nums text-primary">
                  {pct(avgNightlyTipPct)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  over {totalNightsTracked} night{totalNightsTracked !== 1 ? 's' : ''}
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-cyan-600 dark:border-l-cyan-400">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Last Night Tips
                </CardTitle>
                <Banknote className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold tabular-nums">{fmt(recentTipTotal)}</div>
                {recentDate && (
                  <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(recentDate)}</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-emerald-600 dark:border-l-emerald-400">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Last Night Sales
                </CardTitle>
                <BarChart2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold tabular-nums">{fmt(recentSales)}</div>
                {recentDate && (
                  <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(recentDate)}</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-violet-600 dark:border-l-violet-400">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Last Night Tip %
                </CardTitle>
                <Calendar className="h-4 w-4 text-violet-700 dark:text-violet-300" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold tabular-nums">{pct(recentTipPct)}</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {recentTipPct > avgNightlyTipPct
                    ? `+${pct(recentTipPct - avgNightlyTipPct)} vs avg`
                    : `${pct(recentTipPct - avgNightlyTipPct)} vs avg`}
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
