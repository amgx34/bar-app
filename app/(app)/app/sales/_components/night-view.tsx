import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buildCumulative } from '@/lib/pos/cumulative';
import type { ItemMargin, CategoryMargin } from '@/lib/pos/sales-analytics';
import type { PeriodSalesData } from '../actions';
import { LiveBand } from './live-band';
import { MissingPanel } from './missing-panel';
import { HourlyCurve } from './hourly-curve';
import { CumulativeChart } from './cumulative-chart';
import { PaymentSplit, CategoryBars } from './night-bits';
import { money } from './sales-bits';

/**
 * One night, read on a phone.
 *
 * Lifted out of page.tsx, which was switching four periods' worth of layout in
 * a single 465-line component — the two single-night branches were the half
 * nobody could hold in their head while changing the other half.
 *
 * ORDER IS THE DESIGN. On a phone every panel is full-width and stacked, so
 * the sequence IS the hierarchy, and it follows the questions in the order a
 * bar actually asks them: how much (the band), how is it going (the running
 * total), when was it busy (the hours), what sold (movers and mix), how were
 * they paying (the drawer). Anything below the fold is something you go
 * looking for, not something you glance at.
 */
export function NightView({
  data,
  title,
  live,
  hourKnown,
  asOf,
  items,
  categories,
}: {
  data: PeriodSalesData;
  title: string;
  live: boolean;
  /** False until the browser has reported the bar's own hour. */
  hourKnown: boolean;
  asOf: string | null;
  items: ItemMargin[];
  categories: CategoryMargin[];
}) {
  if (!data.capabilities.hasHourly || !data.daypart) {
    return <MissingPanel title="When the money came in" capability="hasHourly" />;
  }

  const cumulative = buildCumulative(data.daypart);
  const topMovers = [...items].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return (
    <>
      <LiveBand
        title={title}
        netSales={data.daypart.totalNet}
        tickets={data.tickets}
        // A baseline computed against the SERVER's hour would be a confidently
        // wrong percentage rendered on a financial screen — worse than none.
        baseline={live && !hourKnown ? null : (data.baseline?.netSales ?? null)}
        hasTickets={data.capabilities.hasTickets}
        asOf={asOf}
        live={live}
        night={data.night}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">How the night is going</CardTitle>
          <p className="text-xs text-muted-foreground">
            Everything taken, hour by hour. The line stops where trade stops.
          </p>
        </CardHeader>
        <CardContent><CumulativeChart points={cumulative} /></CardContent>
      </Card>

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
            <div className="space-y-3">
              {topMovers.map((i) => (
                <div key={i.matchKey} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {i.itemName}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {Math.round(i.unitsSold).toLocaleString()} sold
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums font-medium">{money(i.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">What sold</CardTitle>
          <p className="text-xs text-muted-foreground">
            Revenue by category. Margins live on the week and month views, where
            there are enough sales for them to mean anything.
          </p>
        </CardHeader>
        <CardContent><CategoryBars categories={categories} /></CardContent>
      </Card>

      {/*
        Only rendered when the POS reported the split. A NULL cash/card pair
        means the POS said nothing, not that the night took no cash — see
        AGENTS.md — and PaymentSplit returns null rather than drawing a
        100%-cash bar out of two missing numbers.
      */}
      {data.night && data.night.cashSales !== null && data.night.cardSales !== null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">How they paid</CardTitle>
          </CardHeader>
          <CardContent><PaymentSplit night={data.night} /></CardContent>
        </Card>
      )}
    </>
  );
}
