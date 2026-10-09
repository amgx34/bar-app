'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, ChevronDown, HandCoins, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PayoutDialog } from './payout-dialog';
import { PayEveryoneDialog } from './pay-everyone-dialog';
import { deletePayout } from '../payout-actions';
import {
  PAYOUT_METHOD_LABEL, totalPaidTo,
  type BulkPayableEntry, type Payout, type PayoutSummary,
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

/** "3 days" or, for one or two, the dates themselves — compact either way. */
function coversDaysLabel(coversDays: string[] | null): string | null {
  if (!coversDays || coversDays.length === 0) return null;
  if (coversDays.length <= 2) {
    return coversDays.map((d) => shortDate(`${d}T00:00:00`)).join(', ');
  }
  return `${coversDays.length} days`;
}

/**
 * The payment history a single ledger row can now hold: date, amount, method,
 * and — the only way back from a mis-recorded advance while a balance still
 * remains — a per-payment remove, gated on `canAdjust`.
 *
 * Kept compact on purpose: this expands inside a dense payroll table on a
 * phone, so it is a disclosure rather than always-on.
 */
function PaymentsList({
  payouts, canAdjust, onChanged,
}: {
  payouts: Payout[];
  canAdjust: boolean;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  function remove(payoutId: string) {
    setRemovingId(payoutId);
    startTransition(async () => {
      const res = await deletePayout({ payoutId });
      if (!res.ok) {
        toast.error(res.error ?? 'Could not remove that payment');
        setRemovingId(null);
        return;
      }
      toast.success('Payment removed');
      onChanged();
    });
  }

  return (
    <ul className="mt-1.5 space-y-1 border-l-2 border-muted pl-2.5">
      {payouts.map((p) => {
        const days = coversDaysLabel(p.coversDays);
        return (
          <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-muted-foreground">
              {shortDate(p.paidAt)} · {PAYOUT_METHOD_LABEL[p.method]} ·{' '}
              <span className="font-medium tabular-nums text-foreground">
                ${p.amountPaid.toFixed(2)}
              </span>
              {days && <span> · {days}</span>}
            </span>
            {canAdjust && (
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={pending && removingId === p.id}
                aria-label={`Remove the ${PAYOUT_METHOD_LABEL[p.method].toLowerCase()} payment of $${p.amountPaid.toFixed(2)} from ${shortDate(p.paidAt)}`}
                className="shrink-0 rounded p-0.5 text-muted-foreground/70 hover:bg-muted hover:text-destructive disabled:opacity-50"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Toggle that reveals `PaymentsList` under a chip. A plain disclosure rather
 * than a popover or dialog: this sits inline in a table cell / phone card and
 * must not fight the rest of the row for space.
 */
function PaymentsDisclosure({
  payouts, canAdjust, onChanged, block,
}: {
  payouts: Payout[];
  canAdjust: boolean;
  onChanged: () => void;
  block: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (payouts.length === 0) return null;

  return (
    <div className={cn(block && 'w-full')}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        {expanded ? 'Hide' : payouts.length === 1 ? '1 payment' : `${payouts.length} payments`}
        <ChevronDown
          className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
          aria-hidden
        />
      </button>
      {expanded && (
        <PaymentsList payouts={payouts} canAdjust={canAdjust} onChanged={onChanged} />
      )}
    </div>
  );
}

type ProgressProps = {
  summary: PayoutSummary;
  /** Omitted on screens with no settle-everyone action — the bar is then read-only. */
  bulk?: {
    entries: BulkPayableEntry[];
    alreadyPaidByEmployee: ReadonlyMap<string, number>;
    periodStart: string;
    periodEnd: string;
    canAdjust: boolean;
    onChanged: () => void;
  };
};

export function PayoutProgress({ summary, bulk }: ProgressProps) {
  const { paidCount, totalCount, outstanding, allPaid } = summary;
  const [payAllOpen, setPayAllOpen] = useState(false);
  if (totalCount === 0) return null;

  const pct = Math.round((paidCount / totalCount) * 100);

  /*
    The settle-everyone affordance, and why it is a BUTTON.

    The ask was to make the bar's text clickable. It is a labelled button
    instead, in the same place: this is the largest money action in the app —
    one press records a payment for every unpaid person on the run — and a
    label that turns out to be clickable is how somebody settles a whole period
    while trying to select the figure next to it. The dialog it opens names
    every person and amount before anything is written.

    Hidden once everyone is square, so the finished state stays a statement
    rather than an invitation to press something.
  */
  const canPayAll = Boolean(bulk?.canAdjust) && !allPaid && outstanding > 0;

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

      {canPayAll && bulk && (
        <>
          <button
            type="button"
            onClick={() => setPayAllOpen(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <HandCoins className="h-3.5 w-3.5" aria-hidden />
            Pay remaining {totalCount - paidCount}
          </button>
          {payAllOpen && (
            <PayEveryoneDialog
              open={payAllOpen}
              onOpenChange={setPayAllOpen}
              periodStart={bulk.periodStart}
              periodEnd={bulk.periodEnd}
              entries={bulk.entries}
              alreadyPaidByEmployee={bulk.alreadyPaidByEmployee}
              onSaved={bulk.onChanged}
            />
          )}
        </>
      )}

      {!allPaid && (
        <span className="text-sm tabular-nums">
          {summary.advancedTotal > 0 && (
            <>
              {/* "advanced", not "paid out": advancedTotal excludes anyone
                  already fully paid, so this figure FALLS as people are
                  settled even though more money keeps leaving the building. */}
              <span className="text-muted-foreground">advanced </span>
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
        <div className={cn('inline-flex flex-col items-start', block && 'w-full items-center')}>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
              block && 'w-full justify-center py-2',
            )}
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            {label}
          </span>
          <PaymentsDisclosure payouts={payouts} canAdjust={false} onChanged={onChanged} block={block} />
        </div>
      );
    }

    return (
      <div className={cn('inline-flex flex-col items-start', block && 'w-full items-center')}>
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
        {/* The chip above only ever undoes the LAST payment — a mis-recorded
            advance from earlier in the ledger needs its own remove, which is
            what this disclosure is for (see the design's payments-list
            requirement and the fix for the "can never be removed" defect). */}
        <PaymentsDisclosure
          payouts={payouts} canAdjust={canAdjust} onChanged={onChanged} block={block}
        />
      </div>
    );
  }

  if (partly) {
    // Amber, not green: money has moved but this person is not finished, and a
    // green tick here would read as done on a Friday-afternoon skim.
    if (!canAdjust) {
      return (
        <div className={cn('inline-flex flex-col items-start', block && 'w-full items-center')}>
          <span className={cn('text-xs text-muted-foreground', block && 'block text-center')}>
            ${paidSoFar.toFixed(2)} of ${amount.toFixed(2)}
          </span>
          <PaymentsDisclosure payouts={payouts} canAdjust={false} onChanged={onChanged} block={block} />
        </div>
      );
    }
    return (
      <div className={cn('inline-flex flex-col items-start', block && 'w-full items-center')}>
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
        {/* This is the only way to remove a mis-recorded advance while a
            balance remains: paying the rest and undoing would remove the
            settlement, not the mistake, and hand the advance back. */}
        <PaymentsDisclosure
          payouts={payouts} canAdjust={canAdjust} onChanged={onChanged} block={block}
        />
        {dialog}
      </div>
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
