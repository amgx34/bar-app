import { AlertTriangle, CheckCircle2, HelpCircle, FlaskConical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { SetupGap, GapSummary, GapKind } from '@/lib/pos/setup-gaps';

/**
 * The setup work list: which drinks the POS sells that inventory cannot account
 * for, worst first.
 *
 * Deliberately shows correctly-configured items too, at the bottom and collapsed
 * into a count. A list of only problems gives no sense of how much of the
 * catalogue is fine, and an operator who cannot see that beer is already correct
 * will wonder whether it was simply missed.
 */

const STYLES: Record<GapKind, { label: string; badge: string; icon: typeof AlertTriangle }> = {
  'needs-pour-size': {
    label: 'Needs pour size',
    badge: 'border-destructive/40 bg-destructive/10 text-destructive',
    icon: AlertTriangle,
  },
  'unmapped': {
    label: 'Not in inventory',
    badge: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    icon: HelpCircle,
  },
  'needs-recipe': {
    label: 'Needs a recipe',
    badge: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    icon: FlaskConical,
  },
  'ok': {
    label: 'OK',
    badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle2,
  },
};

export function SetupGapsPanel({
  gaps,
  summary,
}: {
  gaps: SetupGap[];
  summary: GapSummary;
}) {
  if (summary.total === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing has sold through the POS in this window, so there is nothing to
            check yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const problems = gaps.filter((g) => g.kind !== 'ok');
  const fine = gaps.filter((g) => g.kind === 'ok');

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {problems.length === 0 ? (
          <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
            All {summary.ok} items that sold are configured correctly. Stock is
            depleting the right things.
          </p>
        ) : (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            <strong>{problems.length}</strong> of {summary.total} items that sold are
            not depleting correctly, covering{' '}
            <strong>{Math.round(summary.unitsAffected).toLocaleString()}</strong> sales
            in 30 days. Until they are fixed, those sales move the wrong stock or none
            at all &mdash; and a weigh session will read the difference as loss.
          </p>
        )}

        {problems.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {problems.map((gap) => {
              const style = STYLES[gap.kind];
              const Icon = style.icon;
              return (
                <li key={gap.itemName} className="p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{gap.itemName}</p>
                      <p className="text-xs text-muted-foreground">
                        {gap.categoryName ?? 'No category'} &middot;{' '}
                        {Math.round(gap.qtySold).toLocaleString()} sold in 30 days
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.badge}`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      {style.label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {gap.detail}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {fine.length > 0 && (
          <details className="rounded-lg border bg-muted/20">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium sm:px-4">
              {fine.length} configured correctly
            </summary>
            <ul className="divide-y border-t">
              {fine.map((gap) => (
                <li
                  key={gap.itemName}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm sm:px-4"
                >
                  <span className="min-w-0">
                    {gap.itemName}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {gap.categoryName ?? 'No category'}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{gap.detail}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="text-xs text-muted-foreground">
          Pour sizes are set on the item itself, or once for a whole category.
          Recipes live under Settings &rarr; Deals &amp; bundles &mdash; a mixed drink
          becomes a recipe over the bottles it is poured from.
        </p>
      </CardContent>
    </Card>
  );
}
