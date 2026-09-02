'use client';

import { useState, useTransition } from 'react';
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
import { PAYOUT_METHODS, PAYOUT_METHOD_LABEL, type PayoutMethod } from '@/lib/payroll/payouts';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  /** What the run currently says is owed. Frozen onto the row when confirmed. */
  amount: number;
  periodStart: string;
  periodEnd: string;
  onSaved: () => void;
};

/**
 * The one step between "owed" and "paid": how the money left the building.
 *
 * Deliberately a single field. Anything more — a note, a date picker, a partial
 * amount — turns a Friday-afternoon tick-off into a form, and the thing being
 * recorded is a fact the person marking it already knows without looking.
 */
export function PayoutDialog({
  open, onOpenChange, employeeId, employeeName, amount, periodStart, periodEnd, onSaved,
}: Props) {
  const [method, setMethod] = useState<PayoutMethod>('cash');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await markPaid({ employeeId, periodStart, periodEnd, method, amountPaid: amount });
      if (!res.ok) {
        setError(res.error ?? 'Could not record that payout');
        return;
      }
      toast.success(`${employeeName} marked paid`);
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
            Mark {employeeName} paid
          </DialogTitle>
          <DialogDescription>
            Records{' '}
            <strong className="tabular-nums text-foreground">${amount.toFixed(2)}</strong>{' '}
            as paid for this period. The amount is kept as it stands now, so a
            later correction to the run will not rewrite it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="payout-method">How were they paid?</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as PayoutMethod)}>
            <SelectTrigger id="payout-method" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYOUT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>{PAYOUT_METHOD_LABEL[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Rendered unconditionally so the live region exists before it has text. */}
        <FormStatus status={error ? 'error' : 'idle'} message={error} />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : 'Mark paid'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
