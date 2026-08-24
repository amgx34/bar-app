import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

export const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);

/** One headline figure. */
export function Stat({
  label, value, sub, tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'good' | 'warn';
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn(
        'mt-1 text-2xl font-bold tabular-nums',
        tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
        tone === 'warn' && 'text-amber-600 dark:text-amber-400',
      )}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * Says out loud how much of the margin is guesswork.
 *
 * Every screen here would otherwise report a headline margin that looks
 * excellent precisely because the costs are missing. An uncosted item counts
 * its revenue and nothing against it, so the less configured a bar is, the
 * better it appears — which is the most dangerous way for a number to be wrong.
 */
export function CostCoverageNotice({
  itemsMissingCost, revenueMissingCost, revenue, topUncosted = [],
}: {
  itemsMissingCost: number;
  revenueMissingCost: number;
  revenue: number;
  /** Worth pricing first. A bar with fifty gaps will not start alphabetically. */
  topUncosted?: { matchKey: string; itemName: string; revenue: number }[];
}) {
  if (itemsMissingCost === 0) return null;
  const share = revenue > 0 ? (revenueMissingCost / revenue) * 100 : 0;

  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/20">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">
          {itemsMissingCost} item{itemsMissingCost === 1 ? '' : 's'} have no cost price
        </span>{' '}
        — {money(revenueMissingCost)} of revenue ({share.toFixed(0)}%) is counted with nothing
        against it, so every margin below is <span className="font-medium">overstated</span>.
        Set costs on the inventory item to fix it.
        {topUncosted.length > 0 && (
          <>
            {' '}Start with{' '}
            {topUncosted.map((i, n) => (
              <span key={i.matchKey}>
                {n > 0 && ', '}
                <span className="font-medium text-foreground">{i.itemName}</span>{' '}
                ({money(i.revenue)})
              </span>
            ))}
            .
          </>
        )}
      </p>
    </div>
  );
}

/** The POS reports tax-inclusive prices, so revenue holds money the bar never keeps. */
export function TaxInclusiveNotice({ rate }: { rate: number }) {
  return (
    <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="text-muted-foreground">
        POS prices include {rate}% sales tax, so revenue here contains tax the bar does not
        keep and margins read slightly high. Settings → General controls this.
      </p>
    </div>
  );
}
