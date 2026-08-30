import type { Metadata } from 'next';
import dynamicImport from 'next/dynamic';
import Link from 'next/link';
import {
  BookOpen, TrendingUp, TrendingDown,
  DollarSign, Users, Percent, Landmark,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getBooksData } from './actions';
import { listExpenses } from './expense-actions';
import { ExpensesPanel } from './_components/expenses-panel';
import { PureProfitBand } from './_components/pure-profit-band';
import { getCurrentOrg } from '@/lib/org';
import { canEditInventory } from '@/lib/permissions';
import { BENCHMARKS, judgeAgainstBenchmark } from '@/lib/books/cost-structure';

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

  // Independent of each other, so they run together.
  const [data, expenses, { role }] = await Promise.all([
    getBooksData(start, end),
    listExpenses(start, end),
    getCurrentOrg(),
  ]);

  const PRESETS = [
    { label: 'This Month', value: 'month' },
    { label: 'Last 30d',   value: '30d' },
    { label: 'Last 90d',   value: '90d' },
    { label: 'YTD',        value: 'ytd' },
  ];

  const kpis = [
    {
      label: data.taxConfigured ? 'Net Revenue' : 'Revenue',
      value: fmtMoney(data.revenue),
      // Says explicitly whether tax has been taken out, so the number is never
      // ambiguous about what it represents.
      sub: data.taxConfigured
        ? `after ${fmtMoney(data.salesTax ?? 0)} sales tax · +${fmtMoney(data.tips)} tips`
        : `+${fmtMoney(data.tips)} tips · tax not configured`,
      icon:  TrendingUp,
      color: 'text-primary',
    },
    {
      // Sales tax gets a slot of its own because it is the one figure on this
      // page that is a liability rather than a result. An owner looking at a
      // healthy month still owes this, and burying it inside the statement is
      // how bars end up spending money they were only holding.
      label: 'Sales Tax Collected',
      value: data.taxConfigured ? fmtMoney(data.salesTax ?? 0) : '—',
      sub: data.taxConfigured
        ? `held for the state · ${data.salesTaxRatePct}% rate`
        : 'set your rate in Settings → General',
      icon: Landmark,
      // Deliberately not green or red. It is neither good news nor bad news;
      // it is money that was never the bar's to judge.
      color: data.taxConfigured ? 'text-sky-600 dark:text-sky-400' : 'text-muted-foreground',
    },
    {
      // Pour cost is the ratio a bar is benchmarked on, so it gets a KPI slot of
      // its own rather than being buried in the statement. The band is context,
      // not a grade — a dive bar and a cocktail bar sit in different parts of it
      // legitimately.
      label: 'Pour Cost',
      value: data.pourCostPct === null ? '—' : `${data.pourCostPct.toFixed(1)}%`,
      sub: data.pourCostPct === null
        ? 'no revenue in this period'
        : `${fmtMoney(data.beverageCogs)} beverage · target under ${BENCHMARKS.pourCost.good}%`,
      icon: Percent,
      color:
        judgeAgainstBenchmark(data.pourCostPct, BENCHMARKS.pourCost) === 'good'
          ? 'text-emerald-600 dark:text-emerald-400'
          : judgeAgainstBenchmark(data.pourCostPct, BENCHMARKS.pourCost) === 'watch'
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-destructive',
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
  ];

  // Sales tax comes off the top, above COGS. It is not a cost of doing
  // business — it is money the bar never owned, so it must leave the statement
  // before any margin is calculated from what remains.
  const summaryRows = [
    ...(data.taxConfigured && data.grossTakings !== null
      ? [
          { label: 'Gross takings', value: data.grossTakings, indent: false, border: false },
          { label: '− Sales tax (held for the state)', value: -(data.salesTax ?? 0), indent: true, border: false },
        ]
      : []),
    { label: data.taxConfigured ? 'Net Revenue' : 'Revenue', value: data.revenue, indent: false, border: data.taxConfigured },
    { label: '− Beverage cost', value: -data.beverageCogs, indent: true, border: false },
    ...(data.foodCogs > 0
      ? [{ label: '− Food cost', value: -data.foodCogs, indent: true, border: false }]
      : []),
    { label: 'Gross Profit',  value: data.grossProfit,     indent: false, border: true  },
    // Below gross profit on purpose: these are real costs, but folding them in
    // above would corrupt pour cost, which is the whole point of the split.
    ...(data.supplies > 0
      ? [{ label: '− Operating supplies', value: -data.supplies, indent: true, border: false }]
      : []),
    { label: '− Labor',       value: -data.totalLabor,     indent: true,  border: false },
    ...(data.operatingExpenses > 0
      ? [{ label: '− Operating expenses', value: -data.operatingExpenses, indent: true, border: false }]
      : []),
    { label: '− Losses',      value: -data.totalLosses,    indent: true,  border: false },
    // Every row above is now actually subtracted from this one. It previously
    // was not: supplies and operating expenses were listed and then skipped.
    { label: 'Pure Profit',   value: data.pureProfit,      indent: false, border: true  },
  ];

  // What the bottom line used to skip. Books printed a total that never
  // subtracted these two, so an owner who knows the old figure will read the
  // corrected one as a bad month rather than as a fix. Worth saying out loud
  // for as long as anyone remembers the old number — see the note below the
  // statement, which is safe to delete once nobody does.
  const previouslyOmitted = data.supplies + data.operatingExpenses;

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

      {/* The answer to the question Books is opened to ask, above the inputs
          that produce it. */}
      <PureProfitBand
        pureProfit={data.pureProfit}
        pureProfitPct={data.pureProfitPct}
        revenue={data.revenue}
        cogs={data.cogs}
        supplies={data.supplies}
        labor={data.totalLabor}
        operatingExpenses={data.operatingExpenses}
        losses={data.totalLosses}
        taxConfigured={data.taxConfigured}
      />

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            {!data.taxConfigured && (
              <p className="text-xs text-muted-foreground mt-1">
                Sales tax is not configured, so these figures are your POS totals as
                reported. If those include tax, the profit shown is higher than what you
                keep.{' '}
                <Link href="/app/settings?tab=general" className="text-primary hover:underline">
                  Set your tax rate
                </Link>{' '}
                to split it out.
              </p>
            )}
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

            {previouslyOmitted > 0 && (
              <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                Pure Profit is after <strong>every</strong> cost on this page.
                That now includes operating supplies ({fmtMoney(data.supplies)})
                and operating expenses ({fmtMoney(data.operatingExpenses)}), which
                this total used to list above but never subtract — so it reads{' '}
                <strong>{fmtMoney(previouslyOmitted)} lower</strong> than it did
                before. Your trade has not changed; the arithmetic has.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Below the statement it feeds: you read the P&L, notice the overheads
          line, and the entries behind it are the next thing on the page. */}
      <ExpensesPanel
        expenses={expenses}
        periodStart={start}
        canEdit={canEditInventory(role)}
      />
    </main>
  );
}
