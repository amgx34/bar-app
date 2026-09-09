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
import { FormStatus } from '@/components/ui/form-status';
import { markPaid } from '../payout-actions';
import { DayPicker } from './day-picker';
import { valueDays } from '@/lib/payroll/day-value';
import { PAYOUT_METHODS, PAYOUT_METHOD_LABEL, type PayoutMethod } from '@/lib/payroll/payouts';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  /** What the run says is still owed. Frozen onto the row when confirmed. */
  amount: number;
  periodStart: string;
  periodEnd: string;
  shifts: { date: string; hours: number }[];
  tipsByDate: Record<string, number>;
  hourlyRate: number;
  overtime: { enabled: boolean; multiplier: number };
  /** Already handed over this period, so the dialog can show the balance. */
  alreadyPaid: number;
  onSaved: () => void;
};

/**
 * The one step between "owed" and "paid": how the money left the building.
 *
 * Still one field for the common case. Paying for some days is a disclosure,
 * not a second flow — an owner ticking eight people off on a Friday afternoon
 * should never have to walk through a day picker to do it.
 */
export function PayoutDialog({
  open, onOpenChange, employeeId, employeeName, amount, periodStart, periodEnd,
  shifts, tipsByDate, hourlyRate, overtime, alreadyPaid, onSaved,
}: Props) {
  const [method, setMethod] = useState<PayoutMethod>('cash');
  const [partial, setPartial] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Generated once per dialog opening. A double-tap on a slow connection sends
  // the same key twice and the second insert collides, rather than recording a
  // second payment to somebody who was paid once.
  const idempotencyKey = useMemo(
    () => crypto.randomUUID(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const tipMap = useMemo(() => new Map(Object.entries(tipsByDate)), [tipsByDate]);

  // Every recorded night, priced. Selection drives the amount, not this list.
  const allDays = useMemo(
    () => valueDays({
      shifts, tipsByDate: tipMap, hourlyRate, overtime,
      selected: shifts.map((s) => s.date),
    }).days,
    [shifts, tipMap, hourlyRate, overtime],
  );

  const picked = useMemo(
    () => valueDays({
      shifts, tipsByDate: tipMap, hourlyRate, overtime,
      selected: [...selected],
    }),
    [shifts, tipMap, hourlyRate, overtime, selected],
  );

  const payAmount = partial ? picked.total : amount;
  const canSubmit = payAmount > 0 && !pending;

  // The nights and the run can disagree: a tip transfer belongs to no night, so
  // it lands on the period total only. Named rather than hidden — two figures
  // that differ must never do so silently.
  const nightsTotal = useMemo(
    () => allDays.reduce((s, d) => s + d.total, 0),
    [allDays],
  );
  const transferGap = Math.abs(nightsTotal - (amount + alreadyPaid)) >= 0.01;

  function toggle(date: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await markPaid({
        employeeId, periodStart, periodEnd, method,
        amountPaid: payAmount,
        coversDays: partial ? [...selected].sort() : null,
        idempotencyKey,
      });
      if (!res.ok) {
        setError(res.error ?? 'Could not record that payout');
        return;
      }
      toast.success(
        partial
          ? `${money(payAmount)} recorded for ${employeeName}`
          : `${employeeName} marked paid`,
      );
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-muted-foreground" aria-hidden />
            Pay {employeeName}
          </DialogTitle>
          <DialogDescription>
            Records{' '}
            <strong className="tabular-nums text-foreground">{money(payAmount)}</strong>{' '}
            against this period. The amount is kept as it stands now, so a later
            correction to the run will not rewrite it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {alreadyPaid > 0 && (
            <p className="text-xs text-muted-foreground">
              {money(alreadyPaid)} already paid for this period.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="payout-method">Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PayoutMethod)}>
              <SelectTrigger id="payout-method">
                <SelectValue>{PAYOUT_METHOD_LABEL[method]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAYOUT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{PAYOUT_METHOD_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!partial ? (
            <button
              type="button"
              onClick={() => setPartial(true)}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Pay for selected days instead
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Days to pay for</Label>
                <button
                  type="button"
                  onClick={() => { setPartial(false); setSelected(new Set()); }}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Pay the whole balance
                </button>
              </div>
              <DayPicker days={allDays} selected={selected} onToggle={toggle} />
              <p className="text-xs text-muted-foreground">
                This is an advance against the period, not a settlement of these
                days. Payday pays the approved total less everything handed over.
              </p>
              {transferGap && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  These nights add up to {money(nightsTotal)}, but the run says{' '}
                  {money(amount + alreadyPaid)} — a tip transfer, a tip cash-out
                  or removal, or opener bonus hours belong to no single night.
                  The run&rsquo;s figure is what caps this payment.
                </p>
              )}
            </div>
          )}

          <FormStatus status={error ? 'error' : 'idle'} message={error} />

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {pending ? 'Recording…' : `Record ${money(payAmount)}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
