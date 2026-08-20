import Link from 'next/link';
import {
  Tags, TrendingUp, AlertTriangle, Clock, HelpCircle, CircleDollarSign, ArrowRight,
} from 'lucide-react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import type { DealsAnalytics } from '../deals-actions';
import type { DealVerdict } from '@/lib/pos/deal-performance';

const money0 = (n: number) => `$${Math.round(n).toLocaleString()}`;

/**
 * Verdicts carry an icon and a colour, but the label always says the thing in
 * words. Colour alone would leave a red badge meaningless to anyone who cannot
 * distinguish it from the amber one.
 */
const VERDICT: Record<DealVerdict, { label: string; icon: typeof TrendingUp; className: string }> = {
  strong: {
    label: 'Working',
    icon: TrendingUp,
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  ok: {
    label: 'Paying its way',
    icon: CircleDollarSign,
    className: 'border-border bg-muted text-muted-foreground',
  },
  'low-margin': {
    label: 'Losing margin',
    icon: AlertTriangle,
    className: 'border-destructive/40 bg-destructive/10 text-destructive',
  },
  slow: {
    label: 'Not pulling',
    icon: Clock,
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  unproven: {
    label: 'Too early',
    icon: HelpCircle,
    className: 'border-border bg-muted text-muted-foreground',
  },
  'no-cost': {
    label: 'Needs costs',
    icon: HelpCircle,
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
};

function VerdictBadge({ verdict }: { verdict: DealVerdict }) {
  const { label, icon: Icon, className } = VERDICT[verdict];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

export function DealsPanel({ data }: { data: DealsAnalytics }) {
  const { performance, summary, daysOfData, candidates } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tags className="h-4 w-4 text-primary" aria-hidden />
          Deals &amp; bundles
        </CardTitle>
        <CardDescription>
          What each deal earns after the cost of what it pours. A deal trades margin
          per unit for volume — this is whether that trade is paying off.
          {daysOfData > 0 && (
            <> Based on {daysOfData} {daysOfData === 1 ? 'day' : 'days'} of POS sales.</>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── Nothing defined yet ─────────────────────────────────────────── */}
        {performance.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="font-medium">No deals defined yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              A deal is a POS item that rings up as one thing but pours several — a
              bucket, a pitcher, a 2-for-1. Tell Rail what each is made of and it can
              show you what they actually cost you.
            </p>

            {candidates.length > 0 && (
              <div className="mt-5 text-left">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  These look like deals and are already selling
                </p>
                <ul className="mt-2 divide-y divide-border border-y border-border">
                  {candidates.map((c) => (
                    <li key={c.name} className="flex items-center justify-between gap-3 py-2">
                      <span className="truncate text-sm font-medium">{c.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {Math.round(c.unitsSold)} sold · {money0(c.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Link
              href="/app/settings?tab=pos"
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-95 transition-[filter]"
            >
              Set up deals
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}

        {/* ── Headline figures ────────────────────────────────────────────── */}
        {performance.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Active deals" value={String(summary.activeDeals)} />
              <Stat label="Sold" value={Math.round(summary.unitsSold).toLocaleString()} />
              <Stat label="Deal revenue" value={money0(summary.revenue)}
                sub={summary.shareOfRevenuePct !== null
                  ? `${summary.shareOfRevenuePct.toFixed(0)}% of POS sales`
                  : undefined} />
              <Stat
                label="Margin"
                value={summary.margin === null ? '—' : money0(summary.margin)}
                sub={
                  summary.margin === null
                    ? 'Add component costs'
                    : summary.marginPct !== null
                      ? `${summary.marginPct.toFixed(0)}% of deal revenue`
                      : undefined
                }
              />
            </div>

            {/* ── What is not working ───────────────────────────────────── */}
            {summary.needsAttention.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
                <p className="flex items-center gap-2 font-heading text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" aria-hidden />
                  {summary.needsAttention.length}{' '}
                  {summary.needsAttention.length === 1 ? 'deal needs' : 'deals need'} a look
                </p>
                <ul className="mt-2 space-y-1.5">
                  {summary.needsAttention.map((d) => (
                    <li key={d.bundleId} className="text-sm">
                      <span className="font-medium">{d.name}</span>
                      <span className="text-muted-foreground"> — {d.verdictReason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── Per-deal detail ───────────────────────────────────────── */}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="py-2 pl-4 pr-3 font-medium">Deal</th>
                    <th className="px-3 py-2 text-right font-medium">Sold</th>
                    <th className="hidden sm:table-cell px-3 py-2 text-right font-medium">Per day</th>
                    <th className="hidden sm:table-cell px-3 py-2 text-right font-medium">Revenue</th>
                    <th className="hidden md:table-cell px-3 py-2 text-right font-medium">Cost to pour</th>
                    <th className="px-3 py-2 text-right font-medium">Margin</th>
                    <th className="py-2 pl-3 pr-4 font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {performance.map((d) => (
                    <tr key={d.bundleId} className={d.isActive ? '' : 'opacity-60'}>
                      <td className="py-2.5 pl-4 pr-3">
                        <span className="font-medium">{d.name}</span>
                        {!d.isActive && (
                          <span className="ml-2 text-xs text-muted-foreground">(paused)</span>
                        )}
                        {d.discountPct !== null && (
                          <span className="block text-xs text-muted-foreground">
                            {d.discountPct.toFixed(0)}% cheaper than buying the parts
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {Math.round(d.unitsSold).toLocaleString()}
                      </td>
                      <td className="hidden sm:table-cell px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {d.unitsPerDaySold > 0 ? d.unitsPerDaySold.toFixed(1) : '—'}
                      </td>
                      <td className="hidden sm:table-cell px-3 py-2.5 text-right tabular-nums">{money0(d.revenue)}</td>
                      <td className="hidden md:table-cell px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {d.costPerUnit === null ? '—' : money0(d.cost)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                        {d.margin === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={d.margin < 0 ? 'text-destructive' : 'text-primary'}>
                            {money0(d.margin)}
                            {d.marginPct !== null && (
                              <span className="block text-xs font-normal text-muted-foreground">
                                {d.marginPct.toFixed(0)}%
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pl-3 pr-4">
                        <VerdictBadge verdict={d.verdict} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Named rather than summarised: "add costs" is only actionable if
                you know which items are missing them. */}
            {performance.some((d) => d.componentsMissingCost.length > 0) && (
              <p className="text-xs text-muted-foreground">
                Missing cost prices on{' '}
                <span className="font-medium">
                  {[...new Set(performance.flatMap((d) => d.componentsMissingCost))].join(', ')}
                </span>
                . Margin cannot be worked out for any deal that pours them.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-heading text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
