'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
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
import { adjustShiftHours, getShiftRoster, type RosterEntry } from '../adjust-actions';

/**
 * Puts somebody onto a night they are not recorded for.
 *
 * Separate from the per-row Adjust dialog for a structural reason: payroll only
 * lists people who have a shift, so an employee who never clocked in cannot be
 * reached from any row. This is the only way to pay them.
 *
 * It loads the whole team for the chosen date and shows what each is already
 * recorded for, so it doubles as the answer to "did anyone get missed".
 */
export function AddToShiftDialog({
  open,
  onOpenChange,
  startDate,
  endDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate: string;
  endDate: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [shiftDate, setShiftDate] = useState(startDate);
  // Carries the date it was loaded for, so "still loading" is derived by
  // comparison rather than set synchronously in the effect below — which would
  // cascade a render on every date change.
  const [roster, setRoster] = useState<{ date: string; entries: RosterEntry[] } | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [regularHours, setRegularHours] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('0');
  const [reason, setReason] = useState('');

  // Reloads whenever the date changes, because who is already on a night is the
  // whole context for this decision.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    getShiftRoster(shiftDate)
      .then((entries) => { if (!cancelled) setRoster({ date: shiftDate, entries }); })
      .catch(() => { if (!cancelled) setRoster({ date: shiftDate, entries: [] }); });

    return () => { cancelled = true; };
  }, [open, shiftDate]);

  const loading = roster?.date !== shiftDate;
  // The previous night's roster stays on screen while the new one loads, and
  // that is load-bearing rather than cosmetic: emptying the list unmounts the
  // selected option, and a controlled Select whose value no longer matches any
  // item clears itself. Picking someone and then correcting the date silently
  // threw the choice away, and the only sign of it was "Choose who worked"
  // after pressing Add. The roster is the whole team either way — only the
  // "already recorded" figures differ between dates.
  const entries = roster?.entries ?? [];
  // Those figures ARE per-date, so the hint waits for the real roster.
  const selected = loading ? undefined : entries.find((r) => r.employeeId === employeeId);

  function submit() {
    if (!employeeId) {
      setError('Choose who worked');
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        await adjustShiftHours({
          employeeId,
          shiftDate,
          regularHours: Number(regularHours),
          overtimeHours: Number(overtimeHours) || 0,
          reason,
        });
        toast.success(`${selected?.name ?? 'Shift'} added to ${shiftDate}`);
        setEmployeeId('');
        setRegularHours('');
        setReason('');
        onOpenChange(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not add that shift';
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add someone to a shift</DialogTitle>
          <DialogDescription>
            For a night somebody worked but the POS has no record of — a missed
            clock-in, or a shift logged against the wrong person. Recorded with your
            name and reason like any other adjustment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="add-date">Night</Label>
            <Input
              id="add-date"
              type="date"
              value={shiftDate}
              min={startDate}
              max={endDate}
              onChange={(e) => setShiftDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-emp">Who worked</Label>
            <Select value={employeeId} onValueChange={(v) => setEmployeeId((v ?? '') as string)}>
              <SelectTrigger id="add-emp" className="w-full h-9">
                <SelectValue placeholder={loading ? 'Loading…' : 'Choose someone'} />
              </SelectTrigger>
              <SelectContent>
                {entries.map((r) => (
                  <SelectItem key={r.employeeId} value={r.employeeId}>
                    {r.name}
                    {r.onShift ? ` — already ${r.hours.toFixed(2)} hrs` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Editing rather than adding is a different intent, and doing it by
                accident would silently replace a real figure. */}
            {selected?.onShift && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {selected.name} is already recorded for {selected.hours.toFixed(2)} hours
                that night. Saving replaces that figure.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-reg">Regular hours</Label>
              <Input
                id="add-reg" type="number" min="0" max="24" step="0.25"
                inputMode="decimal" placeholder="0.00"
                value={regularHours}
                onChange={(e) => setRegularHours(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-ot">Overtime hours</Label>
              <Input
                id="add-ot" type="number" min="0" max="24" step="0.25"
                inputMode="decimal"
                value={overtimeHours}
                onChange={(e) => setOvertimeHours(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Both boxes count as hours worked &mdash; overtime is worked out across the
            whole week, on anything past 40 hours.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="add-reason">Reason</Label>
            <Input
              id="add-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Forgot to clock in"
            />
          </div>

          <FormStatus status={error ? 'error' : 'idle'} message={error} />

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={submit} disabled={isPending} className="gap-1.5">
              <UserPlus className="h-4 w-4" aria-hidden />
              {isPending ? 'Saving…' : 'Add shift'}
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
