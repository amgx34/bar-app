'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, Clock, Send, Undo2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  submitPayrollForApproval, approvePayrollRun, requestPayrollChanges,
} from '../../approval-actions';
import type { PayrollRun } from '../../approval-actions';
import type { RunDiff } from '@/lib/payroll/run-diff';

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

/**
 * The change list an owner must look at before approving a stale run.
 *
 * This is the whole reason the workflow snapshots rather than flags: without
 * it, an approval means "someone clicked yes at some point", which is not a
 * control at all.
 */
function StaleDiff({ diff }: { diff: RunDiff }) {
  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
      <p className="text-sm font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4" />
        The figures changed after this was submitted
      </p>

      <div className="space-y-1.5">
        {diff.changes.map((c) => (
          <div key={c.employeeId} className="text-xs flex items-baseline justify-between gap-3">
            <span className="font-medium">{c.employeeName}</span>
            <span className="text-muted-foreground tabular-nums text-right">
              {c.kind === 'added'   && `added — ${c.hoursAfter}h, ${money(c.payAfter ?? 0)}`}
              {c.kind === 'removed' && `removed — was ${c.hoursBefore}h, ${money(c.payBefore ?? 0)}`}
              {c.kind === 'changed' && (
                `${c.hoursBefore}h → ${c.hoursAfter}h · ${money(c.payBefore ?? 0)} → ${money(c.payAfter ?? 0)}`
              )}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs font-semibold tabular-nums border-t border-amber-300/60 dark:border-amber-800/60 pt-2">
        Total {money(diff.payBefore)} → {money(diff.payAfter)}
        <span className={cn('ml-2', diff.payDelta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600')}>
          ({diff.payDelta >= 0 ? '+' : ''}{money(diff.payDelta)})
        </span>
      </p>

      <p className="text-xs text-muted-foreground">
        Approving accepts the new figures. Send it back if they need checking first.
      </p>
    </div>
  );
}

const STATUS_STYLES = {
  pending_approval:  { label: 'Awaiting approval', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200',   Icon: Clock },
  approved:          { label: 'Approved',          cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200', Icon: CheckCircle },
  changes_requested: { label: 'Changes requested', cls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',           Icon: Undo2 },
} as const;

export function ApprovalPanel({
  run, diff, startDate, endDate, canSubmit, canApprove,
}: {
  run:       PayrollRun | null;
  diff:      RunDiff | null;
  startDate: string;
  endDate:   string;
  canSubmit: boolean;
  canApprove: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sendingBack, setSendingBack] = useState(false);

  const status = run ? STATUS_STYLES[run.status] : null;
  const isStale = Boolean(diff?.isStale);

  function run_(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Something went wrong');
      else setSendingBack(false);
    });
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Approval</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {run
              ? `Submitted ${new Date(run.submitted_at).toLocaleDateString()}`
              : 'This period has not been submitted for approval.'}
          </p>
        </div>

        {status && (
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', status.cls)}>
            <status.Icon className="h-3.5 w-3.5" /> {status.label}
          </span>
        )}
      </div>

      {run?.review_note && run.status === 'changes_requested' && (
        <p className="text-sm rounded-lg bg-muted/50 border px-3 py-2">
          <span className="text-muted-foreground">Note: </span>{run.review_note}
        </p>
      )}

      {run?.override_reason && (
        <p className="text-xs text-muted-foreground rounded-lg bg-muted/50 border px-3 py-2">
          Approval gate overridden: {run.override_reason}
        </p>
      )}

      {/* Only shown to whoever can act on it — a manager cannot resolve a diff. */}
      {canApprove && run?.status === 'pending_approval' && isStale && diff && (
        <StaleDiff diff={diff} />
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {/* Submit / resubmit */}
        {canSubmit && run?.status !== 'approved' && (
          <button
            disabled={pending}
            onClick={() => run_(() => submitPayrollForApproval(startDate, endDate))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
            {run ? 'Resubmit for approval' : 'Submit for approval'}
          </button>
        )}

        {canApprove && run?.status === 'pending_approval' && !sendingBack && (
          <>
            <button
              disabled={pending}
              onClick={() => run_(() => approvePayrollRun(startDate, endDate, { acceptChanges: isStale }))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-40"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              {isStale ? 'Approve new figures' : 'Approve'}
            </button>
            <button
              disabled={pending}
              onClick={() => setSendingBack(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-40"
            >
              <Undo2 className="h-3.5 w-3.5" /> Send back
            </button>
          </>
        )}
      </div>

      {sendingBack && (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="What needs changing?"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              disabled={pending || !note.trim()}
              onClick={() => run_(() => requestPayrollChanges(startDate, endDate, note))}
              className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
            >
              Send back
            </button>
            <button
              onClick={() => { setSendingBack(false); setNote(''); }}
              className="rounded-lg border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {run?.status === 'approved' && (
        <p className="text-xs text-muted-foreground">
          ACH export is unlocked for this period.
        </p>
      )}
    </div>
  );
}
