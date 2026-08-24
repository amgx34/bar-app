import type { Metadata } from 'next';
import { Layers } from 'lucide-react';
import { getSalesData } from '../actions';
import { RangeFilter } from '../_components/range-filter';
import { CostCoverageNotice, money, pct } from '../_components/sales-bits';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sales by Category' };

/**
 * What sells against what actually pays.
 *
 * The two answers routinely differ, which is the entire reason this screen is
 * separate from the overview: a category can be the busiest on the menu and the
 * least worth pouring. Both orderings are shown side by side rather than making
 * the operator re-sort and hold the first list in their head.
 */
export default async function SalesCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const data = await getSalesData(sp.range, sp.from, sp.to);

  const byRevenue = data.categories;
  const byMargin = [...data.categories]
    .filter((c) => c.marginPct !== null)
    .sort((a, b) => (b.marginPct ?? 0) - (a.marginPct ?? 0));

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <p className="text-sm text-muted-foreground">Sales</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Layers className="h-6 w-6 text-primary" aria-hidden />
          By Category
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What each part of the menu sold, and what it left behind.
        </p>
      </div>

      <RangeFilter range={data.range} />
      <CostCoverageNotice
        itemsMissingCost={data.summary.itemsMissingCost}
        revenueMissingCost={data.summary.revenueMissingCost}
        revenue={data.summary.revenue}
        topUncosted={data.topUncosted}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Every category</CardTitle>
        </CardHeader>
        <CardContent>
          {byRevenue.length === 0 ? (
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
                  {byRevenue.map((c) => (
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Busiest</CardTitle>
            <p className="text-xs text-muted-foreground">By revenue — what is selling.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {byRevenue.slice(0, 5).map((c) => (
              <div key={c.category} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{c.category}</span>
                <span className="shrink-0 tabular-nums font-medium">{money(c.revenue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Most profitable</CardTitle>
            <p className="text-xs text-muted-foreground">By margin % — what is worth pouring.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {byMargin.slice(0, 5).map((c) => (
              <div key={c.category} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{c.category}</span>
                <span className="shrink-0 tabular-nums font-medium">{pct(c.marginPct)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
