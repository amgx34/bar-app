import Link from 'next/link';
import { AlertTriangle, Wallet } from 'lucide-react';

/**
 * What the bar actually kept, at the top of Books.
 *
 * Every other figure on this page is an input to this one, and an owner opening
 * Books is asking this question first. It was previously a single KPI card in a
 * grid of seven, indistinguishable from COGS — and it was showing the wrong
 * number, short by supplies and operating expenses.
 *
 * The deduction chips are not decoration. A profit figure with no visible
 * derivation invites the reader to assume it left something out, which on this
 * page it genuinely used to.
 */

function fmtMoney(n: number) {
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
  return n < 0 ? `(${str})` : str;
}

type Deduction = { label: string; amount: number };

export function PureProfitBand({
  pureProfit,
  pureProfitPct,
  revenue,
  cogs,
  supplies,
  labor,
  operatingExpenses,
  losses,
  taxConfigured,
}: {
  pureProfit: number;
  /** Null when there is no revenue to divide by — not 0, which reads as a result. */
  pureProfitPct: number | null;
  revenue: number;
  cogs: number;
  supplies: number;
  labor: number;
  operatingExpenses: number;
  losses: number;
  taxConfigured: boolean;
}) {
  const positive = pureProfit >= 0;

  // Only what was actually spent. A row of zeroes reads as a bar with no
  // overheads rather than as a period with nothing entered against them.
  const deductions: Deduction[] = [
    { label: 'Cost of goods', amount: cogs },
    { label: 'Supplies', amount: supplies },
    { label: 'Labor', amount: labor },
    { label: 'Expenses', amount: operatingExpenses },
    { label: 'Losses', amount: losses },
  ].filter((d) => d.amount > 0);

  return (
    <section
      aria-labelledby="pure-profit-heading"
      className={`rounded-xl border p-5 sm:p-6 ${
        positive
          ? 'border-primary/30 bg-primary/5'
          : 'border-destructive/40 bg-destructive/5'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            id="pure-profit-heading"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            <Wallet className="h-4 w-4" aria-hidden />
            Pure Profit
          </p>
          <p
            className={`mt-1 text-3xl font-bold tabular-nums sm:text-4xl ${
              positive ? 'text-primary' : 'text-destructive'
            }`}
          >
            {fmtMoney(pureProfit)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {taxConfigured
              ? 'Net revenue after sales tax, goods, labor and every operating cost'
              : 'After goods, labor and every operating cost'}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Margin
          </p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              positive ? 'text-primary' : 'text-destructive'
            }`}
          >
            {/* Null, not 0%. "0% margin" reads as a trading result; no revenue
                means there was nothing to have a margin on. */}
            {pureProfitPct === null ? '—' : `${pureProfitPct.toFixed(1)}%`}
          </p>
          <p className="text-xs text-muted-foreground">
            {pureProfitPct === null ? 'no revenue in period' : 'of net revenue'}
          </p>
        </div>
      </div>

      {/* The derivation, left to right. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 border-t pt-4 text-xs">
        <span className="rounded-md bg-background px-2 py-1 font-medium tabular-nums">
          {taxConfigured ? 'Net revenue' : 'Revenue'} {fmtMoney(revenue)}
        </span>
        {deductions.map((d) => (
          <span
            key={d.label}
            className="rounded-md bg-background px-2 py-1 tabular-nums text-muted-foreground"
          >
            − {d.label} {fmtMoney(d.amount)}
          </span>
        ))}
      </div>

      {/* The one state where this number is knowably wrong rather than merely
          unknown. Reported plainly, because an owner spending money they were
          only holding for the state is the exact harm the tax split exists to
          prevent — see lib/books/sales-tax.ts. */}
      {!taxConfigured && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Sales tax is not configured, so if your POS totals include tax this
            figure is <strong>higher than what you actually keep</strong>.{' '}
            <Link
              href="/app/settings?tab=general"
              className="font-medium underline underline-offset-2"
            >
              Set your tax rate
            </Link>{' '}
            to split it out.
          </span>
        </p>
      )}
    </section>
  );
}
