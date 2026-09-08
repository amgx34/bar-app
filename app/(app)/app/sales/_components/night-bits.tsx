import type { CategoryMargin } from '@/lib/pos/sales-analytics';
import type { NightLedger } from '../actions';
import { money } from './sales-bits';

/**
 * The drawer split, shown only when the POS actually reported one.
 *
 * `cash_sales` / `card_sales` are nullable with no default, and NULL means the
 * POS did not report the split — not that the night took no cash. Older agents,
 * emailed Z reports and pre-1.1.0 configs all send nothing. Rendering a missing
 * split as a full cash bar would invent a fact about the drawer.
 */
export function PaymentSplit({ night }: { night: NightLedger }) {
  if (night.cashSales === null || night.cardSales === null) return null;

  const total = night.cashSales + night.cardSales;
  if (total <= 0) return null;

  const cashPct = (night.cashSales / total) * 100;

  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-primary" style={{ width: `${cashPct}%` }} aria-hidden />
        <div className="bg-primary/35" style={{ width: `${100 - cashPct}%` }} aria-hidden />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
          Cash
          <span className="tabular-nums font-medium">{money(night.cashSales)}</span>
          <span className="text-xs text-muted-foreground">{cashPct.toFixed(0)}%</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary/35" aria-hidden />
          Card
          <span className="tabular-nums font-medium">{money(night.cardSales)}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Category mix as proportional bars rather than a table.
 *
 * A phone has room for a name, a number and a length — and length is the part
 * that answers "what does this bar actually sell", which is the only question
 * a single night's category breakdown can support. The full costed table stays
 * on Week and Month, where the margin columns have enough sales to mean
 * something.
 */
export function CategoryBars({ categories }: { categories: CategoryMargin[] }) {
  const ranked = [...categories].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  if (ranked.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No sales in this window.
      </p>
    );
  }

  const top = ranked[0].revenue;

  return (
    <div className="space-y-3">
      {ranked.map((c) => (
        <div key={c.category} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{c.category}</span>
            <span className="shrink-0 tabular-nums font-medium">{money(c.revenue)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              // Against the biggest category, not the total: on a night where
              // one category is 70% of trade, share-of-total bars leave every
              // other row a stub too short to compare against its neighbours.
              style={{ width: `${top > 0 ? Math.max((c.revenue / top) * 100, 2) : 0}%` }}
              aria-hidden
            />
          </div>
        </div>
      ))}
    </div>
  );
}
