'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Clock, ArrowLeftRight, Sunrise, UserMinus, Unlock, HandCoins } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FormStatus } from '@/components/ui/form-status';
import { adjustShiftHours, transferTips, setOpener, removeFromShift, revertShiftToPos, removeTipsFromPool } from '../adjust-actions';
import type { PayrollEntry } from '../actions';

type Mode = 'hours' | 'transfer' | 'opener' | 'remove' | 'revert' | 'payout';

// Mirrors the `reason` schema in adjust-actions.ts. Kept in step with it on
// purpose: the server is still the authority, but a server rejection reaches
// the browser as a redacted "an error occurred" in production, so a correction
// refused for a missing reason used to fail silently. Checking here is what
// turns that into a sentence the operator can act on.
const REASON_MIN = 3;
const REASON_MAX = 300;

/** The reason a change cannot be saved yet, or null when it can. */
function validate(
  mode: Mode,
  fields: { reason: string; regularHours: string; overtimeHours: string; counterparty: string; amount: string },
): string | null {
  if (mode !== 'opener') {
    const reason = fields.reason.trim();
    if (reason.length === 0) {
      return 'Give a reason for this change — it is shown in the adjustment log and on the pay stub query later.';
    }
    if (reason.length < REASON_MIN) {
      return `That reason is too short. Write at least ${REASON_MIN} characters saying what happened.`;
    }
    if (reason.length > REASON_MAX) {
      return `That reason is ${reason.length} characters. Keep it under ${REASON_MAX}.`;
    }
  }

  if (mode === 'hours') {
    // An empty box coerces to 0 through Number(), which would quietly zero out
    // somebody's night instead of failing. Catch it before it becomes a wage.
    if (fields.regularHours.trim() === '') {
      return 'Enter the regular hours for that night. Use 0 only if they genuinely worked none.';
    }
    const regular = Number(fields.regularHours);
    const overtime = fields.overtimeHours.trim() === '' ? 0 : Number(fields.overtimeHours);
    if (!Number.isFinite(regular) || regular < 0 || regular > 24) {
      return 'Regular hours must be between 0 and 24.';
    }
    if (!Number.isFinite(overtime) || overtime < 0 || overtime > 24) {
      return 'Overtime hours must be between 0 and 24.';
    }
  }

  if (mode === 'transfer') {
    if (!fields.counterparty) return 'Choose who the tips are moving to.';
    const amount = Number(fields.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return 'Enter an amount greater than zero.';
    }
  }

  if (mode === 'payout') {
    const amount = Number(fields.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return 'Enter an amount greater than zero.';
    }
  }

  return null;
}

/**
 * Manual corrections to one person's pay.
 *
 * All three live behind one dialog because they are the same task from the
 * operator's side: "this row is wrong, fix it". Splitting them across the page
 * would mean hunting for the right control while a bartender waits.
 *
 * Every mode requires a date, because payroll is computed per night and an
 * adjustment with no night attached cannot be applied — or explained later.
 */
export function AdjustDialog({
  open,
  onOpenChange,
  entry,
  everyone,
  startDate,
  endDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: PayrollEntry | null;
  everyone: PayrollEntry[];
  startDate: string;
  endDate: string;
}) {
  const [mode, setMode] = useState<Mode>('hours');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Defaults to the start of the period being viewed: adjustments almost always
  // concern a night inside it, and typing a full date every time is friction on
  // a task done in a hurry.
  const [shiftDate, setShiftDate] = useState(startDate);
  const [regularHours, setRegularHours] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('0');
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  // Suppresses the inline warning until the operator has either tried to save
  // or left the field, so an untouched dialog does not open shouting.
  const [touched, setTouched] = useState(false);

  if (!entry) return null;

  const reasonMissing = mode !== 'opener' && reason.trim().length < REASON_MIN;

  const others = everyone.filter((e) => e.employeeId !== entry.employeeId);

  // `fn` may return its own message when the outcome is not knowable up front —
  // releasing a shift that was never locked succeeded, but "released to the POS"
  // would be a lie.
  function run(fn: () => Promise<string | void>, success: string) {
    setError(null);
    startTransition(async () => {
      try {
        const outcome = await fn();
        toast.success(typeof outcome === 'string' ? outcome : success);
        setReason('');
        setAmount('');
        setTouched(false);
        onOpenChange(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not save that change';
        setError(message);
        toast.error(message);
      }
    });
  }

  function submit() {
    if (!entry) return;

    // Checked on submit rather than by disabling the button: a greyed-out
    // control tells the operator nothing about what is missing, and "why can't
    // I save this" is the exact confusion this is meant to remove.
    const problem = validate(mode, { reason, regularHours, overtimeHours, counterparty, amount });
    if (problem) {
      setTouched(true);
      setError(problem);
      toast.error(problem);
      return;
    }

    if (mode === 'hours') {
      run(
        () => adjustShiftHours({
          employeeId: entry.employeeId,
          shiftDate,
          regularHours: Number(regularHours),
          overtimeHours: Number(overtimeHours) || 0,
          reason,
        }),
        `${entry.employeeName}'s hours updated`,
      );
      return;
    }

    if (mode === 'transfer') {
      run(
        () => transferTips({
          fromEmployeeId: entry.employeeId,
          toEmployeeId: counterparty,
          shiftDate,
          amount: Number(amount),
          reason,
        }),
        'Tips moved',
      );
      return;
    }

    if (mode === 'revert') {
      run(
        async () => {
          const { wasLocked } = await revertShiftToPos({
            employeeId: entry.employeeId,
            shiftDate,
            reason,
          });
          // Reported rather than swallowed: "nothing was locked" is a useful
          // answer, not a failure, and claiming it was released would teach the
          // operator that the button does something it did not do.
          return wasLocked
            ? `${entry!.employeeName}'s shift released to the POS`
            : 'That shift was already following the POS — nothing to unlock.';
        },
        `${entry.employeeName}'s shift released to the POS`,
      );
      return;
    }

    if (mode === 'payout') {
      run(
        () => removeTipsFromPool({
          shiftDate,
          amount: Number(amount),
          // Attributed to the row the dialog was opened from, because that is
          // who the cash went to. The action accepts null for a removal that
          // belongs to nobody; there is no way to express that from here yet.
          employeeId: entry.employeeId,
          reason,
        }),
        `${entry.employeeName} cashed out`,
      );
      return;
    }

    if (mode === 'remove') {
      run(
        () => removeFromShift({ employeeId: entry.employeeId, shiftDate, reason }),
        `${entry.employeeName} removed from that night`,
      );
      return;
    }

    run(
      () => setOpener({ employeeId: entry.employeeId, shiftDate }),
      `${entry.employeeName} marked as opener`,
    );
  }

  const MODES: { key: Mode; label: string; icon: typeof Clock }[] = [
    { key: 'hours', label: 'Hours', icon: Clock },
    { key: 'transfer', label: 'Move tips', icon: ArrowLeftRight },
    { key: 'opener', label: 'Opener', icon: Sunrise },
    { key: 'payout', label: 'Cash out', icon: HandCoins },
    { key: 'remove', label: 'Remove', icon: UserMinus },
    { key: 'revert', label: 'Unlock', icon: Unlock },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust {entry.employeeName}</DialogTitle>
          <DialogDescription>
            Changes are recorded with your name and reason, and shown in the
            adjustment log for this period.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {MODES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setMode(key); setError(null); setTouched(false); }}
              aria-pressed={mode === key}
              className={`flex min-w-[4.5rem] flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                mode === key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="adj-date">Night</Label>
            <Input
              id="adj-date"
              type="date"
              value={shiftDate}
              min={startDate}
              max={endDate}
              onChange={(e) => setShiftDate(e.target.value)}
            />
          </div>

          {mode === 'hours' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="adj-reg">Regular hours</Label>
                  <Input
                    id="adj-reg" type="number" min="0" max="24" step="0.25"
                    inputMode="decimal" placeholder="0.00"
                    value={regularHours}
                    onChange={(e) => setRegularHours(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adj-ot">Overtime hours</Label>
                  <Input
                    id="adj-ot" type="number" min="0" max="24" step="0.25"
                    inputMode="decimal"
                    value={overtimeHours}
                    onChange={(e) => setOvertimeHours(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Replaces what the POS recorded for that night. The original figure
                is kept in the log. Both boxes count as hours worked &mdash; overtime
                is worked out across the whole week, on anything past 40 hours.
              </p>
            </>
          )}

          {mode === 'transfer' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="adj-to">Move to</Label>
                <Select value={counterparty} onValueChange={(v) => setCounterparty((v ?? '') as string)}>
                  <SelectTrigger id="adj-to" className="w-full h-9">
                    <SelectValue placeholder="Choose someone" />
                  </SelectTrigger>
                  <SelectContent>
                    {others.map((o) => (
                      <SelectItem key={o.employeeId} value={o.employeeId}>
                        {o.employeeName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adj-amount">Amount ($)</Label>
                <Input
                  id="adj-amount" type="number" min="0" step="0.01"
                  inputMode="decimal" placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Taken off {entry.employeeName} and given to the person you choose.
                The night&rsquo;s total is unchanged.
              </p>
            </>
          )}

          {mode === 'payout' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="adj-payout">Amount ($)</Label>
                <Input
                  id="adj-payout" type="number" min="0" step="0.01"
                  inputMode="decimal" placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Records that {entry.employeeName} was handed this much of their own tips
                in cash, so it comes off their payroll figure and not off anybody
                else&rsquo;s. Applied after any transfers, so cashing somebody out for
                everything they had means their final figure. The reason stays on the
                pay run.
              </p>
            </>
          )}

          {mode === 'remove' && (
            <p className="text-sm text-muted-foreground">
              Sets {entry.employeeName}&rsquo;s hours to zero for that night — for a
              missed clock-out, or a shift the POS logged against the wrong person.
              The row stays with your reason attached, so the next POS sync cannot
              quietly put the hours back.
            </p>
          )}

          {mode === 'revert' && (
            <p className="text-sm text-muted-foreground">
              Hands this night back to the POS. Corrected hours are frozen so the
              2Touch sync cannot overwrite them &mdash; use this once the POS itself
              has been fixed and you want its figures again.
              <strong className="text-foreground"> The next sync may change what
              {' '}{entry.employeeName} is paid for that night.</strong>
            </p>
          )}

          {mode === 'opener' && (
            <p className="text-sm text-muted-foreground">
              Marks {entry.employeeName} as the opener for that night. Only one
              person can hold it, so this replaces whoever was set before. The
              opener bonus in Settings decides what it pays.
            </p>
          )}

          {mode !== 'opener' && (
            <div className="space-y-1.5">
              <Label htmlFor="adj-reason">
                Reason <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Input
                id="adj-reason"
                value={reason}
                required
                aria-required="true"
                aria-invalid={touched && reasonMissing ? true : undefined}
                aria-describedby="adj-reason-help"
                onChange={(e) => { setReason(e.target.value); setError(null); }}
                onBlur={() => setTouched(true)}
                placeholder="Covered Dana's last hour"
                className={touched && reasonMissing ? 'border-destructive focus-visible:ring-destructive' : undefined}
              />
              <p
                id="adj-reason-help"
                className={`text-xs ${touched && reasonMissing ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {touched && reasonMissing
                  ? `Required — at least ${REASON_MIN} characters.`
                  : 'Required. Recorded against your name so this change can be explained later.'}
              </p>
            </div>
          )}

          <FormStatus status={error ? 'error' : 'idle'} message={error} />

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={submit} disabled={isPending}>
              {isPending ? 'Saving…' : mode === 'remove' ? 'Remove from shift' : 'Save change'}
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
