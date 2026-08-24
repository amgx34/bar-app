import type { Metadata } from 'next';
import { TrendingUp, PackageX } from 'lucide-react';
import { getSalesData } from './actions';
import { RangeFilter } from './_components/range-filter';
import { TrendChart } from './_components/trend-chart';
import { Stat, CostCoverageNotice, TaxInclusiveNotice, money, pct } from './_components/sales-bits';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sales' };

/**
 * How the bar traded over a window — takings, what it cost to pour, what is
 * left. Books answers the same question for the whole business including labour
 * and expenses; this one is about the drinks.
 */
export default async function SalesOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const data = await getSalesData(sp.range, sp.from, sp.to);
  const s = data.summary;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <p className="text-sm text-muted-foreground">Sales</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <TrendingUp className="h-6 w-6 text-primary" aria-hidden />
          Overall Sales
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {s.unitsSold.toLocaleString()} drinks sold over {data.range.label.toLowerCase()}.
        </p>
      </div>

      <RangeFilter range={data.range} />

      {data.revenueIncludesTax && <TaxInclusiveNotice rate={data.salesTaxRate} />}
      <CostCoverageNotice
        itemsMissingCost={s.itemsMissingCost}
        revenueMissingCost={s.revenueMissingCost}
        revenue={s.revenue}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue" value={money(s.revenue)} sub={`${s.itemCount} items sold`} />
        <Stat label="Cost to pour" value={money(s.cost)} sub="Ingredient cost" />
        <Stat label="Margin" value={money(s.margin)} tone="good" />
        <Stat
          label="Margin %"
          value={pct(s.marginPct)}
          tone={s.itemsMissingCost > 0 ? 'warn' : 'good'}
          sub={s.itemsMissingCost > 0 ? 'Overstated — costs missing' : undefined}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <PackageX className="h-4 w-4 text-muted-foreground" aria-hidden />
            What not to reorder
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Built from inventory rather than the sales list, so things that did not ring up
            once still appear — those are the ones a sales report cannot show you.
          </p>
        </CardHeader>
        <CardContent>
          {data.slowMovers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing in inventory to check yet.
            </p>
          ) : (
            <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Sold</th>
                    <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">In stock</th>
                    <th className="px-3 py-2 text-right font-medium">Tied up</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.slowMovers.map((m) => (
                    <tr key={m.matchKey}>
                      <td className="py-2.5 pr-3 font-medium whitespace-normal">
                        {m.itemName}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {m.categoryName ?? 'Uncategorised'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {m.neverSold ? (
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                            never
                          </span>
                        ) : (
                          Math.round(m.unitsSold).toLocaleString()
                        )}
                      </td>
                      <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">
                        {m.currentStock === null ? '—' : m.currentStock.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {m.stockValue === null ? '—' : money(m.stockValue)}
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
          <CardTitle className="text-sm font-semibold">Revenue and margin over time</CardTitle>
          <p className="text-xs text-muted-foreground">
            Each night costed on its own mix, not the period average.
          </p>
        </CardHeader>
        <CardContent>
          <TrendChart data={data.trend} />
        </CardContent>
      </Card>
    </main>
  );
}
