import Link from 'next/link';
import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { Checklist } from '@/lib/onboarding/checklist';
import { dismissOnboarding } from '../actions';

/** Four derived steps for a new bar. Nothing is stored except the dismissal. */
export function SetupChecklist({ checklist, canDismiss }: { checklist: Checklist; canDismiss: boolean }) {
  const { items, doneCount, allDone } = checklist;
  return (
    <section aria-labelledby="setup-heading">
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="setup-heading" className="font-heading text-sm font-semibold tracking-tight">
              {allDone ? 'You are set up' : 'Get set up'}
            </h2>
            <span className="text-sm text-muted-foreground">{doneCount} of {items.length} done</span>
          </div>
          <ul className="divide-y divide-border">
            {items.map((it) => {
              const Icon = it.status === 'done' ? CheckCircle2 : it.status === 'problem' ? AlertTriangle : Circle;
              const tone = it.status === 'done' ? 'text-emerald-600 dark:text-emerald-400'
                : it.status === 'problem' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
              return (
                <li key={it.key}>
                  <Link href={it.href} className="flex min-h-11 items-start gap-3 py-2.5 hover:bg-muted/40 -mx-2 px-2 rounded-md">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {it.title}
                        <span className="sr-only">{it.status === 'done' ? ', done' : it.status === 'problem' ? ', needs attention' : ', to do'}</span>
                      </span>
                      <span className="block text-xs text-muted-foreground">{it.why}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {canDismiss && (
            <form action={dismissOnboarding}>
              <button type="submit" className="min-h-11 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
                {allDone ? 'Hide this' : 'Hide for now'}
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
