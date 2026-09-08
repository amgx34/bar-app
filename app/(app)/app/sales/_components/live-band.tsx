import { Radio } from 'lucide-react';
import type { TicketMetrics } from '@/lib/pos/tickets';
import type { Baseline } from '@/lib/pos/baselines';
import type { NightLedger } from '../actions';

/**
 * One figure in the band's grid.
 *
 * A dash, never a zero, when the figure is unknown — the same distinction the
 * average ticket already draws. Two columns on a phone, four across at `sm`.
 */
function BandStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold tabular-nums sm:text-2xl">{value ?? '—'}</p>
    </div>
  );
}

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
  night,
}: {
  title: string;
  netSales: number;
  tickets: TicketMetrics | null;
  baseline: Baseline | null;
  hasTickets: boolean;
  /** "11:47pm" — when the POS last reported. Null when unknown. */
  asOf: string | null;
  live: boolean;
  /** The Z close-out, for the tips and tax stats. Null when there is no row. */
  night: NightLedger | null;
}) {
  const delta = baseline?.deltaPct ?? null;
  const up = delta !== null && delta >= 0;

  /*
    Only figures this night actually has. A stat rendered as a dash is honest
    when the number is genuinely unknown but the panel exists — an average
    ticket on a night nobody rang up — whereas a bar whose POS sends no ticket
    feed at all should not be shown an empty Tickets box every night of its
    life. Hence: absent capability drops the stat, absent value shows a dash.
  */
  const stats: { label: string; value: string | null }[] = [];
  if (hasTickets && tickets) {
    stats.push({ label: 'Tickets', value: tickets.ticketCount.toLocaleString() });
    // Null, not $0. Nobody ringing up is not a $0 average.
    stats.push({ label: 'Avg ticket', value: tickets.averageTicket === null ? null : money(tickets.averageTicket) });
  }
  if (night?.tips !== null && night?.tips !== undefined) {
    stats.push({ label: 'Tips', value: money(night.tips) });
    stats.push({
      label: 'Tips/hr',
      // Null when no hours were recorded — see lib/pos/tip-rate.ts.
      value: night.tipsPerHour === null ? null : money(night.tipsPerHour),
    });
  }
  // Tax is only ever shown when the split is a real calculation. An unset rate
  // produces no stat rather than a dash: there is nothing missing, the bar
  // simply has not told us how it is taxed.
  if (night?.taxHeld != null) {
    stats.push({ label: 'Tax held', value: money(night.taxHeld) });
  }

  return (
    <section
      aria-labelledby="sales-live-heading"
      className="rounded-xl border border-primary/30 bg-primary/5 p-5 sm:p-6"
    >
      {/*
        Headline above, stats below — stacked rather than side by side. The old
        two-column arrangement wrapped on a phone into a headline and a ragged
        stat row of whatever happened to fit, which put the least important
        figure in the most prominent leftover space.
      */}
      <div className="min-w-0">
        <p
          id="sales-live-heading"
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
        >
          {live && <Radio className="h-3.5 w-3.5 text-primary" aria-hidden />}
          {title}
        </p>
        <p className="mt-1 text-4xl font-bold tabular-nums text-primary sm:text-5xl">
          {money(netSales)}
        </p>
        {asOf && (
          <p className="mt-1 text-xs text-muted-foreground">
            {live ? `as of ${asOf} · still trading` : `last reported ${asOf}`}
          </p>
        )}
      </div>

      {stats.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-4 sm:grid-cols-4">
          {stats.map((s) => (
            <BandStat key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      )}

      <div className="mt-4 border-t pt-3 text-xs">
        {baseline === null || baseline.average === null || delta === null ? (
          <span className="text-muted-foreground">
            No comparable nights recorded yet, so there is nothing to measure this against.
          </span>
        ) : (
          <span className={up ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
            {up ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}% on the last{' '}
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
