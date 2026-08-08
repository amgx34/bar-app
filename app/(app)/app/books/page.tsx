import type { Metadata } from 'next';
import dynamicImport from 'next/dynamic';
import Link from 'next/link';
import {
  BookOpen, TrendingUp, TrendingDown,
  DollarSign, Users, Calculator,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getBooksData } from './actions';

const MonthlyChart = dynamicImport(
  () => import('./_components/books-charts').then((m) => ({ default: m.MonthlyChart })),
);
const MarginChart = dynamicImport(
  () => import('./_components/books-charts').then((m) => ({ default: m.MarginChart })),
);

export const dynamic = 'force-dynamic';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return n < 0 ? `(${str})` : str;
}

function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmt(d: Date)   { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function getDateRange(preset: string): { start: string; end: string } {
  const now = new Date();
  switch (preset) {
    case '30d': {
      const s = new Date(now); s.setDate(now.getDate() - 29);
      return { start: fmt(s), end: fmt(now) };
    }
    case '90d': {
      const s = new Date(now); s.setDate(now.getDate() - 89);
      return { start: fmt(s), end: fmt(now) };
    }
    case 'month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: fmt(s), end: fmt(now) };
    }
    default: // ytd
      return { start: `${now.getFullYear()}-01-01`, end: fmt(now) };
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

type SearchParams = Promise<{ preset?: string; start?: string; end?: string }>;

export const metadata: Metadata = { title: 'Books' };

export default async function BooksPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const preset = params.preset ?? 'ytd';

  const { start, end } = params.start && params.end
    ? { start: params.start, end: params.end }
    : getDateRange(preset);

  const data = await getBooksData(start, end);

  const PRESETS = [
    { label: 'This Month', value: 'month' },
    { label: 'Last 30d',   value: '30d' },
    { label: 'Last 90d',   value: '90d' },
    { label: 'YTD',        value: 'ytd' },
  ];

  const kpis = [
    {
      label: 'Revenue',
      value: fmtMoney(data.revenue),
      sub:   `+${fmtMoney(data.tips)} tips`,
      icon:  TrendingUp,
      color: 'text-primary',
    },
    {
      label: 'COGS',
      value: fmtMoney(data.cogs),
      sub:   data.revenue > 0 ? `${fmtPct((data.cogs / data.revenue) * 100)} of revenue` : '—',
      icon:  TrendingDown,
      color: 'text-amber-600',
    },
    {
      label: 'Gross Profit',
      value: fmtMoney(data.grossProfit),
      sub:   `${fmtPct(data.grossMarginPct)} margin`,
      icon:  DollarSign,
      color: data.grossProfit >= 0 ? 'text-primary' : 'text-destructive',
    },
    {
      label: 'Total Labor',
      value: fmtMoney(data.totalLabor),
      sub:   `${fmtPct(data.laborPct)} of revenue`,
      icon:  Users,
      color: 'text-rose-600',
    },
    {
      label: 'Net Operating',
      value: fmtMoney(data.netOperating),
      sub:   'after COGS + labor + losses',
      icon:  Calculator,
      color: data.netOperating >= 0 ? 'text-primary' : 'text-destructive',
    },
  ];

  const summaryRows = [
    { label: 'Revenue',       value: data.revenue,         indent: false, border: false },
    { label: '− COGS',        value: -data.cogs,           indent: true,  border: false },
    { label: 'Gross Profit',  value: data.grossProfit,     indent: false, border: true  },
    { label: '− Labor',       value: -data.totalLabor,     indent: true,  border: false },
    { label: '− Losses',      value: -data.totalLosses,    indent: true,  border: false },
    { label: 'Net Operating', value: data.netOperating,    indent: false, border: true  },
  ];

  return (
    <main className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Financial Overview</p>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            Books
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {PRESETS.map((p) => (
            <Link
              key={p.value}
              href={`/app/books?preset=${p.value}`}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                preset === p.value && !params.start
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className={`text-xl font-bold mt-1 truncate ${kpi.color}`}>{kpi.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
                  </div>
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${kpi.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      {data.monthlyData.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue vs COGS vs Labor</CardTitle>
              <p className="text-xs text-muted-foreground">{start} – {end}</p>
            </CardHeader>
            <CardContent>
              <MonthlyChart data={data.monthlyData} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Margin Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <MarginChart data={data.monthlyData} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No sales data found for this period.
            Import Z Reports in the <strong>Payroll</strong> tab to populate financials.
          </CardContent>
        </Card>
      )}

      {/* Losses + P&L summary */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Losses Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: 'Voids',     value: data.lossesBreakdown.voids },
                { label: 'Comps',     value: data.lossesBreakdown.comps },
                { label: 'Spills',    value: data.lossesBreakdown.spills },
                { label: 'Discounts', value: data.lossesBreakdown.discounts },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium tabular-nums">{fmtMoney(row.value)}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between font-semibold text-sm">
                <span>Total Losses</span>
                <span className="text-destructive tabular-nums">{fmtMoney(data.totalLosses)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">P&amp;L Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {summaryRows.map((row) => (
                <div
                  key={row.label}
                  className={`flex justify-between items-center text-sm ${
                    row.border ? 'border-t pt-2 font-semibold' : ''
                  }`}
                >
                  <span className={row.border ? '' : 'text-muted-foreground pl-2'}>
                    {row.label}
                  </span>
                  <span
                    className={`tabular-nums ${
                      row.value < 0
                        ? 'text-destructive'
                        : row.border && row.value > 0
                        ? 'text-primary'
                        : ''
                    }`}
                  >
                    {fmtMoney(row.value)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
