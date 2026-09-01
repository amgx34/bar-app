import type { Metadata } from 'next';
import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSalesData, getPeriodSalesData } from './actions';
import { getCurrentOrg } from '@/lib/org';
import { PeriodToggle } from '../_components/period-toggle';
import { LiveBand } from './_components/live-band';
import { MissingPanel } from './_components/missing-panel';
import { HourlyCurve } from './_components/hourly-curve';
import { ServerTable } from './_components/server-table';
import { MenuQuadrant } from './_components/menu-quadrant';
import { TrendChart } from './_components/trend-chart';
import { Stat, CostCoverageNotice, TaxInclusiveNotice, SizeSplit, money, pct } from './_components/sales-bits';
import { rankByMargin } from '@/lib/pos/sales-analytics';
import { assessSyncHealth, describeAge } from '@/lib/pos/sync-health';
import { cn } from '@/lib/utils';
import {
  resolveSalesView, defaultSalesPeriod, shiftSalesPeriod,
  payPeriodFromParams, todayIso, type SalesView,
} from '@/lib/date-range';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sales' };

const VIEW_ITEMS: { key: SalesView; label: string }[] = [
  { key: 'tonight', label: 'Tonight' },
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

/** Which column the per-item margin table (Week/Month) is sorted by. */
type ItemSort = 'pct' | 'total';

/**
 * One Sales screen, switched by period.
 *
 * The same operator asks different questions at different horizons: a busy
 * club asks how tonight is going and whether the bar is staffed for the rush; a
 * neighbourhood pub asks how the month went and what to stop ordering. A bar's
 * size mostly decides which horizon it lives at, not which screen it needs.
 *
 * Every panel is gated on what the data can actually support. See
 * lib/pos/sales-capabilities.ts — a bar whose POS sends daily totals only still
 * gets a working screen, with the hourly panels replaced by one sentence
 * saying what is missing and how to get it.
 */
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const view = resolveSalesView(params.view);
  const today = todayIso();

  const period = payPeriodFromParams(params.start, params.end)
    ?? defaultSalesPeriod(view, today);

  const { org } = await getCurrentOrg();
  if (!org?.id) return <div className="p-6">Organization not found</div>;

  const singleNight = view === 'tonight' || view === 'day';
  // Tonight compares like for like: past nights are measured only as far into
  // the evening as tonight has reached. Comparing a half-finished Saturday
  // against four complete ones reports a disaster every time.
  const upToHour = view === 'tonight' ? new Date().getHours() : undefined;

  const [data, legacy] = await Promise.all([
    getPeriodSalesData(view, period.start, period.end, upToHour),
    getSalesData('custom', period.start, period.end),
  ]);

  const prev = shiftSalesPeriod(view, period.start, period.end, 'prev');
  const next = shiftSalesPeriod(view, period.start, period.end, 'next');
  const href = (v: SalesView) => {
    const p = defaultSalesPeriod(v, singleNight ? period.start : today);
    return `/app/sales?view=${v}&start=${p.start}&end=${p.end}`;
  };

  // Margin table sort, for Week/Month only — Categories and Margins were
  // absorbed into these views rather than dropped, and this is the state that
  // used to live on /app/sales/margins.
  const itemSort: ItemSort = params.sort === 'total' ? 'total' : 'pct';
  const rankedItems = rankByMargin(legacy.items, itemSort);
  const itemSortHref = (s: ItemSort) =>
    `/app/sales?view=${view}&start=${period.start}&end=${period.end}&sort=${s}`;

  // Whether the POS agent is still feeding this bar, so a stale agent is
  // visible on the night's own number rather than silently reporting an old
  // night as current. Same idiom as the dashboard's sync strip.
  const syncHealth = assessSyncHealth(
    org.pos_config as Record<string, unknown> | null,
    org.pos_provider as string | null,
  );
  const asOf = syncHealth.lastSyncAt ? describeAge(syncHealth.minutesAgo) : null;

  // Top movers: the period's items ranked by revenue, not a new query or a
  // re-derivation of margin — legacy.items already carries revenue per item.
  const topMovers = [...legacy.items].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Sales</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <TrendingUp className="h-6 w-6 text-primary" aria-hidden />
            {singleNight ? 'The night' : view === 'week' ? 'The week' : 'The month'}
          </h1>
        </div>
        <PeriodToggle
          view={view}
          items={VIEW_ITEMS}
          hrefs={Object.fromEntries(VIEW_ITEMS.map((i) => [i.key, href(i.key)])) as Record<SalesView, string>}
        />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <a className="rounded-md border px-2 py-1 hover:bg-muted"
           href={`/app/sales?view=${view}&start=${prev.start}&end=${prev.end}`}>←</a>
        <span className="min-w-[180px] text-center font-medium">
          {period.start === period.end ? period.start : `${period.start} – ${period.end}`}
        </span>
        <a className="rounded-md border px-2 py-1 hover:bg-muted"
           href={`/app/sales?view=${view}&start=${next.start}&end=${next.end}`}>→</a>
      </div>

      {legacy.revenueIncludesTax && <TaxInclusiveNotice rate={legacy.salesTaxRate} />}

      {singleNight ? (
        data.capabilities.hasHourly && data.daypart ? (
          <>
            <LiveBand
              title={view === 'tonight' ? 'Tonight' : period.start}
              netSales={data.daypart.totalNet}
              tickets={data.tickets}
              baseline={data.baseline?.netSales ?? null}
              hasTickets={data.capabilities.hasTickets}
              asOf={asOf}
              live={view === 'tonight'}
            />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">When the money came in</CardTitle>
                {data.daypart.peak && (
                  <p className="text-xs text-muted-foreground">
                    Busiest hour {data.daypart.peak.label} — {money(data.daypart.peak.netSales)}
                  </p>
                )}
              </CardHeader>
              <CardContent><HourlyCurve daypart={data.daypart} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Top movers</CardTitle>
                <p className="text-xs text-muted-foreground">By revenue.</p>
              </CardHeader>
              <CardContent>
                {topMovers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No sales in this window.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {topMovers.map((i) => (
                      <div key={i.matchKey} className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <span className="truncate">{i.itemName}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {Math.round(i.unitsSold).toLocaleString()} sold
                          </span>
                        </div>
                        <span className="shrink-0 tabular-nums font-medium">{money(i.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <MissingPanel title="When the money came in" capability="hasHourly" />
        )
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Revenue" value={money(legacy.summary.revenue)} sub={`${legacy.summary.itemCount} items sold`} />
            <Stat label="Cost to pour" value={money(legacy.summary.cost)} sub="Ingredient cost" />
            <Stat label="Margin" value={money(legacy.summary.margin)} tone="good" />
            <Stat label="Margin %" value={pct(legacy.summary.marginPct)}
                  tone={legacy.summary.itemsMissingCost > 0 ? 'warn' : 'good'} />
          </div>
          <CostCoverageNotice
            itemsMissingCost={legacy.summary.itemsMissingCost}
            revenueMissingCost={legacy.summary.revenueMissingCost}
            revenue={legacy.summary.revenue}
          />
          {/*
            The category table from the old /app/sales/categories screen,
            ported faithfully rather than reinvented.
          */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Category mix</CardTitle>
            </CardHeader>
            <CardContent>
              {legacy.categories.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No sales in this window.
                </p>
              ) : (
                <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Category</th>
                        <th className="px-3 py-2 text-right font-medium">Sold</th>
                        <th className="px-3 py-2 text-right font-medium">Revenue</th>
                        <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Cost</th>
                        <th className="px-3 py-2 text-right font-medium">Margin</th>
                        <th className="px-3 py-2 text-right font-medium">Margin %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {legacy.categories.map((c) => (
                        <tr key={c.category}>
                          <td className="py-2.5 pr-3 font-medium whitespace-normal">
                            {c.category}
                            {c.itemsMissingCost > 0 && (
                              <span className="block text-xs font-normal text-amber-600 dark:text-amber-400">
                                {c.itemsMissingCost}/{c.itemCount} uncosted
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {Math.round(c.unitsSold).toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{money(c.revenue)}</td>
                          <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">
                            {money(c.cost)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                            {money(c.margin)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{pct(c.marginPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {data.menu && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">What earns its place</CardTitle>
              </CardHeader>
              <CardContent><MenuQuadrant board={data.menu} /></CardContent>
            </Card>
          )}

          {/*
            The per-item margin table from the old /app/sales/margins screen,
            absorbed here rather than dropped. This is the only place in the
            app that shows the sgl/dbl/rsgl/rdb split per item (SizeSplit,
            below) — losing this table would silently remove that feature.
          */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Every item</CardTitle>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">Sort by</span>
                {([['pct', 'Margin %'], ['total', 'Total margin']] as [ItemSort, string][]).map(([k, label]) => (
                  <Link
                    key={k}
                    href={itemSortHref(k)}
                    aria-current={itemSort === k ? 'page' : undefined}
                    className={cn(
                      'flex min-h-9 items-center rounded-md border px-3 text-xs font-medium transition-colors',
                      itemSort === k
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {rankedItems.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nothing with a known cost sold in this window.
                </p>
              ) : (
                <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Item</th>
                        <th className="px-3 py-2 text-right font-medium">Sold</th>
                        <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                          Cost/drink
                        </th>
                        <th className="hidden px-3 py-2 text-right font-medium md:table-cell">
                          Revenue
                        </th>
                        <th className="px-3 py-2 text-right font-medium">Margin</th>
                        <th className="px-3 py-2 text-right font-medium">Margin %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rankedItems.map((i) => (
                        <tr key={i.matchKey}>
                          <td className="py-2.5 pr-3 font-medium whitespace-normal">
                            {i.itemName}
                            <span className="block text-xs font-normal text-muted-foreground">
                              {i.categoryName ?? 'Uncategorised'}
                            </span>
                            <SizeSplit
                              sizes={i.sizes}
                              pourUnits={i.pourUnitsSold}
                              units={i.unitsSold}
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {Math.round(i.unitsSold).toLocaleString()}
                          </td>
                          <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">
                            {i.costPerDrink === null ? '—' : `$${i.costPerDrink.toFixed(3)}`}
                          </td>
                          <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted-foreground md:table-cell">
                            {money(i.revenue)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                            {i.margin === null ? '—' : money(i.margin)}
                          </td>
                          <td
                            className={cn(
                              'px-3 py-2.5 text-right tabular-nums',
                              (i.marginPct ?? 100) < 0 && 'font-semibold text-destructive',
                            )}
                          >
                            {pct(i.marginPct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Slow movers</CardTitle>
              <p className="text-xs text-muted-foreground">
                What to stop ordering — dead stock first, then the slowest sellers.
              </p>
            </CardHeader>
            <CardContent>
              {legacy.slowMovers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing stands out — every stocked item is moving.
                </p>
              ) : (
                <div className="space-y-2">
                  {legacy.slowMovers.map((s) => (
                    <div key={s.matchKey} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <span className="truncate">{s.itemName}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {s.categoryName ?? 'Uncategorised'}
                        </span>
                      </div>
                      <span className="shrink-0 text-right text-xs">
                        {s.neverSold ? (
                          <span className="font-medium text-amber-600 dark:text-amber-400">Never sold</span>
                        ) : (
                          <span className="tabular-nums text-muted-foreground">
                            {Math.round(s.unitsSold).toLocaleString()} sold
                          </span>
                        )}
                        {s.stockValue !== null && (
                          <span className="ml-2 tabular-nums text-muted-foreground">
                            {money(s.stockValue)} on shelf
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Revenue trend</CardTitle>
            </CardHeader>
            <CardContent><TrendChart data={legacy.trend} /></CardContent>
          </Card>
        </>
      )}

      {data.capabilities.hasServer && data.servers ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Who was pouring</CardTitle>
          </CardHeader>
          <CardContent><ServerTable servers={data.servers} /></CardContent>
        </Card>
      ) : (
        <MissingPanel title="Who was pouring" capability="hasServer" />
      )}
    </main>
  );
}
