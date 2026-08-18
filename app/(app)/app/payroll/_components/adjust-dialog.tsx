'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Clock, ArrowLeftRight, Sunrise } from 'lucide-react';
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
import { adjustShiftHours, transferTips, setOpener } from '../adjust-actions';
import type { PayrollEntry } from '../actions';

type Mode = 'hours' | 'transfer' | 'opener';

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

  if (!entry) return null;

  const others = everyone.filter((e) => e.employeeId !== entry.employeeId);

  function run(fn: () => Promise<void>, success: string) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        toast.success(success);
        setReason('');
        setAmount('');
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

    run(
      () => setOpener({ employeeId: entry.employeeId, shiftDate }),
      `${entry.employeeName} marked as opener`,
    );
  }

  const MODES: { key: Mode; label: string; icon: typeof Clock }[] = [
    { key: 'hours', label: 'Hours', icon: Clock },
    { key: 'transfer', label: 'Move tips', icon: ArrowLeftRight },
    { key: 'opener', label: 'Opener', icon: Sunrise },
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

        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {MODES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setMode(key); setError(null); }}
              aria-pressed={mode === key}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
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
                is kept in the log.
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

          {mode === 'opener' && (
            <p className="text-sm text-muted-foreground">
              Marks {entry.employeeName} as the opener for that night. Only one
              person can hold it, so this replaces whoever was set before. The
              opener bonus in Settings decides what it pays.
            </p>
          )}

          {mode !== 'opener' && (
            <div className="space-y-1.5">
              <Label htmlFor="adj-reason">Reason</Label>
              <Input
                id="adj-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Covered Dana's last hour"
              />
            </div>
          )}

          <FormStatus status={error ? 'error' : 'idle'} message={error} />

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={submit} disabled={isPending}>
              {isPending ? 'Saving…' : 'Save change'}
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
