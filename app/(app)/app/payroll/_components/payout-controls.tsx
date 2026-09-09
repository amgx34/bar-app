'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, HandCoins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PayoutDialog } from './payout-dialog';
import { deletePayout } from '../payout-actions';
import {
  PAYOUT_METHOD_LABEL, totalPaidTo, type Payout, type PayoutSummary,
} from '@/lib/payroll/payouts';

/**
 * The paid / not-paid controls, shared by the desktop table and the phone
 * cards so the two layouts cannot drift apart in what they let you do.
 */

/** Short enough for a table cell: "Aug 29". */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function PayoutProgress({ summary }: { summary: PayoutSummary }) {
  const { paidCount, totalCount, outstanding, allPaid } = summary;
  if (totalCount === 0) return null;

  const pct = Math.round((paidCount / totalCount) * 100);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3',
        allPaid
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30'
          : 'bg-card',
      )}
    >
      <div className="flex items-center gap-2">
        {allPaid ? (
          <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        ) : (
          <HandCoins className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="text-sm font-semibold">
          {allPaid ? 'Everyone paid out' : 'Paid out'}
        </span>
      </div>

      <span className="text-sm tabular-nums text-muted-foreground">
        {paidCount} of {totalCount}
      </span>

      {/* The bar is decoration over the counts either side of it — both are
          already text, so it carries no information of its own. */}
      <div
        className="order-last h-2 w-full min-w-[120px] flex-1 overflow-hidden rounded-full bg-muted sm:order-none sm:w-auto"
        aria-hidden
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            allPaid ? 'bg-emerald-500' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {!allPaid && (
        <span className="text-sm tabular-nums">
          {summary.advancedTotal > 0 && (
            <>
              <span className="text-muted-foreground">paid out </span>
              <span className="font-semibold">${summary.advancedTotal.toFixed(2)}</span>
              <span className="text-muted-foreground"> · </span>
            </>
          )}
          <span className="text-muted-foreground">still owed </span>
          <span className="font-semibold">${outstanding.toFixed(2)}</span>
        </span>
      )}
    </div>
  );
}

type CellProps = {
  employeeId: string;
  employeeName: string;
  /** Live figure from the run — the FULL period total, not the balance. */
  amount: number;
  payouts: Payout[];
  periodStart: string;
  periodEnd: string;
  canAdjust: boolean;
  onChanged: () => void;
  layout: 'row' | 'block';
  shifts: { date: string; hours: number }[];
  tipsByDate: Record<string, number>;
  hourlyRate: number;
  overtime: { enabled: boolean; multiplier: number };
};

/**
 * One person's paid state, in three flavours now: nothing, part, all.
 *
 * A paid chip stays a button rather than becoming static text: marking the
 * wrong person paid is a one-tap mistake, and undo has to be as reachable as
 * the thing it undoes. With a ledger, undo removes the LAST payment rather than
 * the period — wiping an advance from last week along with today's slip would
 * be a much worse mistake than the one being corrected.
 */
export function PayoutCell({
  employeeId, employeeName, amount, payouts, periodStart, periodEnd,
  canAdjust, onChanged, layout, shifts, tipsByDate, hourlyRate, overtime,
}: CellProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const block = layout === 'block';

  const paidSoFar = totalPaidTo(payouts);
  const balance = Math.max(0, amount - paidSoFar);
  const fullyPaid = payouts.length > 0 && balance <= 0;
  const partly = payouts.length > 0 && balance > 0;

  function undoLast() {
    const last = payouts[payouts.length - 1];
    if (!last) return;
    startTransition(async () => {
      const res = await deletePayout({ payoutId: last.id });
      if (!res.ok) {
        toast.error(res.error ?? 'Could not undo that');
        return;
      }
      toast.success(`Removed ${PAYOUT_METHOD_LABEL[last.method].toLowerCase()} payment`);
      onChanged();
    });
  }

  const dialog = open && (
    <PayoutDialog
      open={open}
      onOpenChange={setOpen}
      employeeId={employeeId}
      employeeName={employeeName}
      amount={balance}
      periodStart={periodStart}
      periodEnd={periodEnd}
      shifts={shifts}
      tipsByDate={tipsByDate}
      hourlyRate={hourlyRate}
      overtime={overtime}
      alreadyPaid={paidSoFar}
      onSaved={onChanged}
    />
  );

  if (fullyPaid) {
    const last = payouts[payouts.length - 1];
    const label = `${PAYOUT_METHOD_LABEL[last.method]} · ${shortDate(last.paidAt)}`;

    if (!canAdjust) {
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
            block && 'w-full justify-center py-2',
          )}
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          {label}
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={undoLast}
        disabled={pending}
        title={`Paid $${paidSoFar.toFixed(2)} across ${payouts.length} payment(s). Click to remove the last one.`}
        aria-label={`${employeeName} is paid. Undo the last payment.`}
        className={cn(
          'group inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-950/60 dark:text-emerald-200 dark:hover:bg-emerald-900',
          block && 'h-11 w-full justify-center text-sm',
        )}
      >
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        <span className="text-emerald-600/70 opacity-0 transition-opacity group-hover:opacity-100 dark:text-emerald-300/70">
          Undo
        </span>
      </button>
    );
  }

  if (partly) {
    // Amber, not green: money has moved but this person is not finished, and a
    // green tick here would read as done on a Friday-afternoon skim.
    if (!canAdjust) {
      return (
        <span className={cn('text-xs text-muted-foreground', block && 'block text-center')}>
          ${paidSoFar.toFixed(2)} of ${amount.toFixed(2)}
        </span>
      );
    }
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Pay ${employeeName} the remaining $${balance.toFixed(2)}`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-900',
            block && 'h-11 w-full justify-center text-sm',
          )}
        >
          <HandCoins className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate tabular-nums">
            ${paidSoFar.toFixed(2)} of ${amount.toFixed(2)}
          </span>
        </button>
        {dialog}
      </>
    );
  }

  if (!canAdjust) {
    return <span className={cn('text-xs text-muted-foreground', block && 'block text-center')}>Unpaid</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Mark ${employeeName} paid`}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground',
          block && 'h-11 w-full justify-center border-solid text-sm',
        )}
      >
        <HandCoins className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Mark paid
      </button>
      {dialog}
    </>
  );
}
