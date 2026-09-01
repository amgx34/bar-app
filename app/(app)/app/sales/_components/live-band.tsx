import { Radio } from 'lucide-react';
import type { TicketMetrics } from '@/lib/pos/tickets';
import type { Baseline } from '@/lib/pos/baselines';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * Tonight's headline, against the only thing that makes it mean anything.
 *
 * "$3,240" is not information. "$3,240, up 18% on the last four Saturdays at
 * this hour" is a sentence somebody can act on. When there is not enough
 * history to say that, the band says THAT instead — a comparison against one
 * previous night is an anecdote and is labelled as one.
 *
 * Never shows a projected total. A partial night is reported as what has
 * happened, because an extrapolation is a guess and an operator will act on it.
 */
export function LiveBand({
  title,
  netSales,
  tickets,
  baseline,
  hasTickets,
  asOf,
  live,
}: {
  title: string;
  netSales: number;
  tickets: TicketMetrics | null;
  baseline: Baseline | null;
  hasTickets: boolean;
  /** "11:47pm" — when the POS last reported. Null when unknown. */
  asOf: string | null;
  live: boolean;
}) {
  const delta = baseline?.deltaPct ?? null;
  const up = delta !== null && delta >= 0;

  return (
    <section
      aria-labelledby="sales-live-heading"
      className="rounded-xl border border-primary/30 bg-primary/5 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            id="sales-live-heading"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            {live && <Radio className="h-3.5 w-3.5 text-primary" aria-hidden />}
            {title}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-primary sm:text-4xl">
            {money(netSales)}
          </p>
          {asOf && (
            <p className="mt-1 text-xs text-muted-foreground">
              {live ? `as of ${asOf} · still trading` : `last reported ${asOf}`}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-6">
          {hasTickets && tickets && (
            <>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Tickets</p>
                <p className="text-2xl font-bold tabular-nums">
                  {tickets.ticketCount.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Avg ticket</p>
                <p className="text-2xl font-bold tabular-nums">
                  {/* Null, not $0. Nobody ringing up is not a $0 average. */}
                  {tickets.averageTicket === null ? '—' : money(tickets.averageTicket)}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 border-t pt-3 text-xs">
        {baseline === null || baseline.average === null ? (
          <span className="text-muted-foreground">
            No comparable nights recorded yet, so there is nothing to measure this against.
          </span>
        ) : (
          <span className={up ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
            {up ? '▲' : '▼'} {Math.abs(delta as number).toFixed(0)}% on the last{' '}
            {baseline.sampleSize} {baseline.sampleSize === 1 ? 'night' : 'nights'} like this
            {/* Said out loud: one night is an anecdote, not a baseline. */}
            {baseline.thin && (
              <span className="ml-1 text-muted-foreground">
                — thin sample, treat with caution
              </span>
            )}
          </span>
        )}
      </div>
    </section>
  );
}
