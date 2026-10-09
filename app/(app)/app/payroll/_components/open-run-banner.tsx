import Link from 'next/link';
import { Clock, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCurrentOrg } from '@/lib/org';
import { describeOpenRun } from '@/lib/payroll/open-run';
import { getOpenPayrollRun } from '../approval-actions';

/**
 * A pay run that still needs somebody, said on every Payroll tab.
 *
 * Submitting for approval wrote `payroll_runs` and then went quiet: the status
 * appeared only on /app/payroll/review, which is the one screen a person has
 * already left by the time they are waiting for an answer. Managers reported
 * submitting payroll and "nothing happening"; what was actually happening was
 * a row sitting in pending_approval that no screen they visited mentioned.
 *
 * Rendered from the LAYOUT so it covers Pay Run, Employees, Direct Deposit and
 * Review alike — the same reasoning that puts SectionTabs there — and so no
 * page can render a second copy.
 *
 * Renders nothing at all when there is no open run, which is most of the time.
 * A banner that is always present is furniture, and gets read as furniture.
 */

const TONES = {
  waiting: {
    Icon: Clock,
    wrap: 'border-amber-500/40 bg-amber-500/5',
    dot:  'text-amber-600 dark:text-amber-400',
  },
  returned: {
    Icon: Undo2,
    wrap: 'border-destructive/40 bg-destructive/5',
    dot:  'text-destructive',
  },
} as const;

export async function OpenRunBanner() {
  const [{ role }, run] = await Promise.all([getCurrentOrg(), getOpenPayrollRun()]);

  const notice = describeOpenRun(run, role);
  if (!notice || !run) return null;

  const tone = TONES[notice.tone];
  const href =
    `/app/payroll/review?startDate=${run.periodStart}&endDate=${run.periodEnd}`;

  return (
    <div className={cn('mx-5 mb-4 rounded-xl border p-3 sm:mx-6 sm:p-4', tone.wrap)}>
      <div className="flex flex-wrap items-start gap-3">
        <tone.Icon className={cn('mt-0.5 h-5 w-5 shrink-0', tone.dot)} aria-hidden />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{notice.headline}</p>

          {/* The reason a run came back belongs WITH the run, not a click away.
              Needing to go and find it is how a send-back stalls. */}
          {notice.note && (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="text-muted-foreground/80">Note: </span>
              {notice.note}
            </p>
          )}

          {notice.extra && (
            <p className="mt-1 text-xs text-muted-foreground">{notice.extra}</p>
          )}
        </div>

        {/* Absent entirely for a role that cannot act, rather than disabled.
            A greyed-out button is a puzzle; nothing is an answer. */}
        {notice.cta && (
          <Link
            href={href}
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg border bg-card px-3 text-sm font-semibold transition-colors hover:bg-muted"
          >
            {notice.cta}
          </Link>
        )}
      </div>
    </div>
  );
}
