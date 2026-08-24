import type { Metadata } from 'next';
import Link from 'next/link';
import { Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { getSalesData } from '../actions';
import { RangeFilter } from '../_components/range-filter';
import { CostCoverageNotice, money, pct } from '../_components/sales-bits';
import { rankByMargin, flagThinMargins } from '@/lib/pos/sales-analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Margin Analysis' };

/** Below this, a drink is called out. Overridable from the query string. */
const DEFAULT_MIN_MARGIN_PCT = 60;

type Sort = 'pct' | 'total';

/**
 * Which drinks are worth pouring, and which are quietly costing money.
 *
 * Sortable two ways on purpose. Margin % asks which pour is most profitable;
 * total margin asks which one actually paid the rent. A shot at 90% that sells
 * twice a week loses to a beer at 60% that moves all night, and an operator
 * shown only one of those orderings will make the wrong call about the menu.
 */
export default async function SalesMarginsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; sort?: string; min?: string }>;
}) {
  const sp = await searchParams;
  const data = await getSalesData(sp.range, sp.from, sp.to);

  const sort: Sort = sp.sort === 'total' ? 'total' : 'pct';
  const parsedMin = Number(sp.min);
  const minMargin =
    Number.isFinite(parsedMin) && parsedMin >= 0 && parsedMin <= 100
      ? parsedMin
      : DEFAULT_MIN_MARGIN_PCT;

  const ranked = rankByMargin(data.items, sort);
  const flags = flagThinMargins(data.items, minMargin);

  // Best and worst always come from the percentage ordering, whatever the table
  // below is sorted by: "best margin" is a rate, not a total.
  const byPct = rankByMargin(data.items, 'pct');
  const best = byPct.slice(0, 5);
  const worst = [...byPct].reverse().slice(0, 5);

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    if (data.range.key !== 'week') p.set('range', data.range.key);
    if (data.range.key === 'custom') {
      p.set('from', data.range.from);
      p.set('to', data.range.to);
    }
    if (minMargin !== DEFAULT_MIN_MARGIN_PCT) p.set('min', String(minMargin));
    for (const [k, v] of Object.entries(over)) p.set(k, v);
    return `/app/sales/margins?${p.toString()}`;
  };

  const SORTS: [Sort, string][] = [
    ['pct', 'Margin %'],
    ['total', 'Total margin'],
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <p className="text-sm text-muted-foreground">Sales</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Scale className="h-6 w-6 text-primary" aria-hidden />
          Margin Analysis
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What each drink costs to pour against what it sells for.
        </p>
      </div>

      <RangeFilter range={data.range} />
      <CostCoverageNotice
        itemsMissingCost={data.summary.itemsMissingCost}
        revenueMissingCost={data.summary.revenueMissingCost}
        revenue={data.summary.revenue}
        topUncosted={data.topUncosted}
      />

      {flags.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
              {flags.length} below {minMargin}% margin
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              A loss is flagged whatever the threshold — selling under cost is not a preference.
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {flags.slice(0, 8).map((f) => (
              <div key={f.item.matchKey} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {f.item.itemName}
                  {f.severity === 'loss' && (
                    <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                      at a loss
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums font-medium">{pct(f.item.marginPct)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Best margin
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {best.map((i) => (
              <div key={i.matchKey} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{i.itemName}</span>
                <span className="shrink-0 tabular-nums font-medium">{pct(i.marginPct)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <TrendingDown className="h-4 w-4 text-muted-foreground" aria-hidden />
              Worst margin
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {worst.map((i) => (
              <div key={i.matchKey} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{i.itemName}</span>
                <span className="shrink-0 tabular-nums font-medium">{pct(i.marginPct)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Every item</CardTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground">Sort by</span>
            {SORTS.map(([k, label]) => (
              <Link
                key={k}
                href={qs({ sort: k })}
                aria-current={sort === k ? 'page' : undefined}
                className={cn(
                  'flex min-h-9 items-center rounded-md border px-3 text-xs font-medium transition-colors',
                  sort === k
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
          {ranked.length === 0 ? (
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
                  {ranked.map((i) => (
                    <tr key={i.matchKey}>
                      <td className="py-2.5 pr-3 font-medium whitespace-normal">
                        {i.itemName}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {i.categoryName ?? 'Uncategorised'}
                        </span>
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
    </main>
  );
}
