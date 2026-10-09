'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { HandCoins } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { markManyPaid } from '../payout-actions';
import {
  PAYOUT_METHODS, PAYOUT_METHOD_LABEL, planBulkPayout,
  type BulkPayableEntry, type PayoutMethod,
} from '@/lib/payroll/payouts';

/**
 * Settling everyone still owed for a period, in one confirmation.
 *
 * The bar's actual Friday job: hand out the envelopes and record it. Doing that
 * one row at a time is a dozen dialogs, and the day-ticking in PayoutDialog —
 * which exists for advances — is noise when the answer is "all of it".
 *
 * IT NAMES EVERY PERSON AND EVERY AMOUNT BEFORE IT WRITES. This is the largest
 * single money action in the app, and the one thing it must never be is a
 * button whose effect you discover afterwards. The list is the point; the
 * confirm is almost incidental.
 */

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodStart: string;
  periodEnd: string;
  /** The run as the table has it, and what each person has already had. */
  entries: BulkPayableEntry[];
  alreadyPaidByEmployee: ReadonlyMap<string, number>;
  onSaved: () => void;
};

export function PayEveryoneDialog({
  open, onOpenChange, periodStart, periodEnd, entries, alreadyPaidByEmployee, onSaved,
}: Props) {
  const [method, setMethod] = useState<PayoutMethod>('cash');
  const [pending, startTransition] = useTransition();

  // The same function the server plans with, so what is listed here is what
  // gets written. A second implementation for display is how a confirmation
  // screen starts lying.
  const plan = useMemo(
    () => planBulkPayout(entries, alreadyPaidByEmployee),
    [entries, alreadyPaidByEmployee],
  );

  /*
    One key per employee, minted when the dialog OPENS and held for as long as
    it stays open.

    Generated here rather than on click for the reason the single payout dialog
    does the same: a double-tap on a slow phone must carry the SAME key both
    times, so the second write collides on ux_payroll_payout_idempotency and
    does nothing. Minting on click would give the two taps different keys and
    pay the entire room twice.

    Reopening after a cancel mints a fresh set, which is right — that is a new
    payment, not a retry of the old one. It comes for free rather than from a
    dependency: PayoutProgress renders this component only while its dialog is
    open, so closing unmounts it and the memo starts empty next time. If that
    ever becomes a permanently-mounted dialog, this memo needs `open` back.
  */
  // Hoisted so the memo's dependency is a plain value. The identity of
  // `plan.lines` changes on every render; WHO is being paid does not, and that
  // is what a key set must survive.
  const payeeIds = plan.lines.map((l) => l.employeeId).join(',');

  const keys = useMemo(() => {
    const next: Record<string, string> = {};
    for (const id of payeeIds ? payeeIds.split(',') : []) next[id] = crypto.randomUUID();
    return next;
  }, [payeeIds]);

  function submit() {
    startTransition(async () => {
      const res = await markManyPaid({ periodStart, periodEnd, method, keys });

      if (!res.ok) {
        toast.error(res.error ?? 'Could not record those payments');
        return;
      }

      // Reported from what was WRITTEN, including the skips. "Done" over a
      // partial result is the silent success this codebase keeps having to
      // fix — if two people were refused, the person holding the cash needs to
      // know which two before they hand out envelopes.
      if (res.paid === 0) {
        toast.info('Nothing to pay — everyone on this run is already settled.');
      } else {
        const refused = res.skipped.filter((s) => s.reason === 'over-cap');
        toast.success(
          `Paid ${res.paid} ${res.paid === 1 ? 'person' : 'people'} · ${money(res.total)}`
          + (refused.length
            ? ` · ${refused.length} skipped: ${refused.map((s) => s.employeeName).join(', ')}`
            : ''),
        );
      }

      onOpenChange(false);
      onSaved();
    });
  }

  const alreadySettled = plan.skipped.filter((s) => s.reason === 'already-paid').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-4 w-4" aria-hidden />
            Pay everyone
          </DialogTitle>
          <DialogDescription>
            {periodStart} to {periodEnd}
            {alreadySettled > 0 && ` · ${alreadySettled} already settled and not listed`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-payout-method">Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PayoutMethod)}>
              <SelectTrigger id="bulk-payout-method">
                <SelectValue>{PAYOUT_METHOD_LABEL[method]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAYOUT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{PAYOUT_METHOD_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Recorded against everyone below. Anyone who was actually paid some
              other way can be corrected from their own row afterwards.
            </p>
          </div>

          {/* Scrolls rather than truncates. A bar with twenty staff still gets
              to see all twenty before the money is recorded. */}
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
            {plan.lines.map((line) => (
              <li key={line.employeeId} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{line.employeeName}</span>
                <span className="shrink-0 tabular-nums">
                  {money(line.amount)}
                  {/* Why this figure is not their period total. Without it a
                      part-advanced person reads as underpaid. */}
                  {line.alreadyPaid > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (after {money(line.alreadyPaid)})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-baseline justify-between gap-3 border-t pt-3 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(plan.total)}</span>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || plan.lines.length === 0}>
              {pending
                ? 'Recording…'
                : `Pay ${plan.lines.length} ${plan.lines.length === 1 ? 'person' : 'people'}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
