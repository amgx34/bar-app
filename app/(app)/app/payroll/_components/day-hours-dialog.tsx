'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Clock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormStatus } from '@/components/ui/form-status';
import { adjustShiftHours } from '../adjust-actions';
import type { DaySplitEmployee } from '../actions';

/**
 * Correcting one person's hours on the night being split.
 *
 * Deliberately narrower than AdjustDialog, which does six things and asks which
 * date you mean. Here the date is the screen you are on, so asking again would
 * be a way to correct the wrong night by accident.
 *
 * The write itself goes through `adjustShiftHours` — the same action the pay run
 * uses — so the permission check, the org check, the audit row and the claim
 * that stops the POS agent reverting the correction all happen there rather
 * than being re-implemented for this screen.
 */

// Mirrors the `reason` schema in adjust-actions.ts. The server is still the
// authority; checking here is what turns a rejection into a sentence, because a
// server error reaches the browser redacted in production.
const REASON_MIN = 3;
const REASON_MAX = 300;

/** Why this cannot be saved yet, or null when it can. */
function validate(regular: string, overtime: string, reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return 'Give a reason for this change — it is shown in the adjustment log if anyone queries their pay later.';
  }
  if (trimmed.length < REASON_MIN) {
    return `That reason is too short. Write at least ${REASON_MIN} characters saying what happened.`;
  }
  if (trimmed.length > REASON_MAX) {
    return `That reason is ${trimmed.length} characters. Keep it under ${REASON_MAX}.`;
  }

  // An empty box coerces to 0 through Number(), which would quietly zero out
  // somebody's night rather than failing. Caught before it becomes a wage.
  if (regular.trim() === '') {
    return 'Enter the regular hours for that night. Use 0 only if they genuinely worked none.';
  }
  const reg = Number(regular);
  const ot = overtime.trim() === '' ? 0 : Number(overtime);
  if (!Number.isFinite(reg) || reg < 0 || reg > 24) return 'Regular hours must be between 0 and 24.';
  if (!Number.isFinite(ot) || ot < 0 || ot > 24) return 'Overtime hours must be between 0 and 24.';

  return null;
}

export function DayHoursDialog({
  open,
  onOpenChange,
  employee,
  date,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: DaySplitEmployee | null;
  /** The night on screen. Not editable here — that is the point. */
  date: string;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Keyed on who and when, so opening the dialog on a different person
            re-initialises the fields from THEIR hours. Mounting fresh is what
            lets the inputs seed straight from props instead of being pushed
            into state by an effect on every open. */}
        {employee && (
          <HoursForm
            key={`${employee.id}:${date}`}
            employee={employee}
            date={date}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function HoursForm({
  employee,
  date,
  onClose,
  onSaved,
}: {
  employee: DaySplitEmployee;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Seeded from what is recorded, BOTH halves. Prefilling overtime as 0 when
  // they actually have some would write that zero back on save and silently
  // take the premium off their night.
  const [regularHours, setRegularHours] = useState(String(employee.regularHours));
  const [overtimeHours, setOvertimeHours] = useState(String(employee.overtimeHours));
  const [reason, setReason] = useState('');

  const problem = validate(regularHours, overtimeHours, reason);
  const total = (Number(regularHours) || 0) + (Number(overtimeHours) || 0);

  function save() {
    setTouched(true);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        await adjustShiftHours({
          employeeId: employee.id,
          shiftDate: date,
          regularHours: Number(regularHours),
          overtimeHours: overtimeHours.trim() === '' ? 0 : Number(overtimeHours),
          reason: reason.trim(),
        });
        toast.success(`${employee.name} set to ${total.toFixed(2)} hours`);
        onClose();
        // The split is divided BY hours, so the shares below and the night's
        // wages above are both stale the moment this succeeds.
        onSaved();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not save those hours';
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" aria-hidden />
            {employee.name}&rsquo;s hours
          </DialogTitle>
          <DialogDescription>
            For this night only. Everyone&rsquo;s tip share is divided by hours, so
            the split below updates when you save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="day-regular-hours">Regular hours</Label>
              <Input
                id="day-regular-hours"
                type="number"
                min={0}
                max={24}
                step={0.25}
                value={regularHours}
                onChange={(e) => setRegularHours(e.target.value)}
                onBlur={() => setTouched(true)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="day-overtime-hours">Overtime hours</Label>
              <Input
                id="day-overtime-hours"
                type="number"
                min={0}
                max={24}
                step={0.25}
                value={overtimeHours}
                onChange={(e) => setOvertimeHours(e.target.value)}
                onBlur={() => setTouched(true)}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Said out loud because the pay run does not take this figure at
              face value — it re-decides overtime across the whole week. Someone
              typing 4 here on a quiet week would otherwise expect a premium
              that never arrives. */}
          <p className="text-xs text-muted-foreground">
            Total {total.toFixed(2)} hours. Overtime is settled across the whole
            week on the pay run, so what is entered here counts as hours worked
            rather than guaranteeing a premium.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="day-hours-reason">Reason</Label>
            <Input
              id="day-hours-reason"
              placeholder="Clocked out late, forgot to clock in…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Recorded against your name in the adjustment log.
            </p>
          </div>

          {/* Only after a save attempt or a blur, so an untouched dialog does
              not open shouting at somebody who has typed nothing yet. */}
          <FormStatus
            status={error || (touched && problem) ? 'error' : 'idle'}
            message={error ?? (touched ? problem : null)}
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={isPending}>
              {isPending ? 'Saving…' : 'Save hours'}
            </Button>
          </div>
        </div>
    </>
  );
}
