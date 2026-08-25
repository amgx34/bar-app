'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, Sunrise } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { adjustShiftHours, getEmployeeDailyHours } from '../adjust-actions';
import { splitWeeklyOvertime, WEEKLY_OVERTIME_THRESHOLD } from '@/lib/payroll/overtime';
import type { DailyHoursRow } from '@/lib/payroll/daily-hours';

/**
 * The nights behind one employee's period total, editable one night at a time.
 *
 * WHY THIS EXISTS
 *
 * The pay run reports a period TOTAL and the Adjust dialog writes a single
 * night, with its date defaulting to the first day of the period. Nothing on
 * screen showed the nights in between. So an operator looking at a week and
 * typing what the week ought to total wrote that figure onto the Monday and
 * left the other six alone — the arithmetic was right, the screen simply never
 * showed which night was wrong.
 *
 * ONE FIGURE PER NIGHT, NOT TWO
 *
 * `employee_shifts` stores regular and overtime separately, but overtime is
 * decided weekly now — at 40 hours across the period, by splitWeeklyOvertime —
 * so a per-night overtime box would be a control that changes nothing about
 * pay while looking like it does. That is the same confusion this panel exists
 * to end. Each night takes one number, hours worked; the split is shown once,
 * in the footer, where it is real.
 */

const REASON_MIN = 3;

function fmtDate(iso: string): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [, m, d] = iso.split('-').map(Number);
  return `${months[m - 1]} ${d}`;
}

export function EmployeeDaysPanel({
  employeeId,
  employeeName,
  startDate,
  endDate,
  canAdjust,
  onSaved,
}: {
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  canAdjust: boolean;
  /** Refreshes the pay run behind this panel once a night has been rewritten. */
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<DailyHoursRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    // Both branches set state from a callback rather than the effect body — a
    // synchronous setState here is a cascading render, and the panel has
    // nothing to show before the load resolves anyway.
    getEmployeeDailyHours(employeeId, startDate, endDate)
      .then((data) => { if (!cancelled) { setRows(data); setLoadError(null); } })
      // Surfaced rather than shown as an empty week: "nobody worked" and "we
      // could not find out" must not look the same on a screen used to correct pay.
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load those nights'); });
    return () => { cancelled = true; };
  }, [employeeId, startDate, endDate]);

  if (loadError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        {loadError}
      </div>
    );
  }

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Loading nights…
      </div>
    );
  }

  // What the panel currently describes, drafts included, so the total moves as
  // you type rather than after a save. This is the figure the week header shows,
  // and seeing them disagree is the whole point.
  const effectiveHours = (row: DailyHoursRow): number => {
    const draft = drafts[row.date];
    if (draft === undefined || draft.trim() === '') return row.hours;
    const n = Number(draft);
    return Number.isFinite(n) && n >= 0 ? n : row.hours;
  };

  const totalHours = rows.reduce((sum, r) => sum + effectiveHours(r), 0);
  const split = splitWeeklyOvertime(
    rows.map((r) => ({ date: r.date, hours: effectiveHours(r) })),
  );
  const dirty = Object.entries(drafts).some(([date, v]) => {
    if (v.trim() === '') return false;
    const row = rows.find((r) => r.date === date);
    return row !== undefined && Number(v) !== row.hours;
  });
  const reasonMissing = reason.trim().length < REASON_MIN;

  function save(row: DailyHoursRow) {
    const draft = drafts[row.date];
    const value = Number(draft);
    if (draft === undefined || draft.trim() === '' || !Number.isFinite(value) || value < 0) {
      toast.error('Enter the hours worked that night');
      return;
    }
    if (value > 24) {
      toast.error('A night cannot be more than 24 hours');
      return;
    }
    if (reasonMissing) {
      toast.error('Give a short reason — it goes in the pay log');
      return;
    }

    setSavingDate(row.date);
    startTransition(async () => {
      try {
        // The whole figure goes in as regular hours with no overtime: the split
        // is derived weekly at pay time, so storing one here would be a second
        // opinion nothing reads.
        await adjustShiftHours({
          employeeId,
          shiftDate: row.date,
          regularHours: value,
          overtimeHours: 0,
          reason,
        });
        setRows((prev) =>
          (prev ?? []).map((r) =>
            r.date === row.date ? { ...r, hours: value, hasShift: true, source: 'manual' } : r,
          ),
        );
        setDrafts((prev) => { const next = { ...prev }; delete next[row.date]; return next; });
        toast.success(`${employeeName} — ${row.weekday} ${fmtDate(row.date)} set to ${value.toFixed(2)} hrs`);
        onSaved();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save those hours');
      } finally {
        setSavingDate(null);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {employeeName} — every night in this period
        </h4>
        <span className="text-xs text-muted-foreground">
          Each night is saved on its own.
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-3 text-left font-medium">Night</th>
              <th className="py-1.5 pr-3 text-right font-medium">Hours</th>
              <th className="py-1.5 pr-3 text-left font-medium">Recorded by</th>
              {canAdjust && <th className="py-1.5 text-right font-medium">Set to</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const changed =
                drafts[row.date] !== undefined &&
                drafts[row.date].trim() !== '' &&
                Number(drafts[row.date]) !== row.hours;

              return (
                <tr key={row.date} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    <span className="font-medium">{row.weekday}</span>{' '}
                    <span className="text-muted-foreground">{fmtDate(row.date)}</span>
                    {row.isOpener && (
                      <span
                        className="ml-1.5 inline-flex items-center gap-0.5 align-middle text-[11px] text-amber-600 dark:text-amber-300"
                        title="Opened the bar"
                      >
                        <Sunrise className="h-3 w-3" aria-hidden />
                        opener
                      </span>
                    )}
                  </td>

                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {row.hasShift ? (
                      row.hours.toFixed(2)
                    ) : (
                      /* Not "0.00": a night with no row is somebody who never
                         clocked in, which is the case worth correcting. */
                      <span className="text-muted-foreground">no shift</span>
                    )}
                  </td>

                  <td className="py-1.5 pr-3 text-xs">
                    {row.source === 'manual' ? (
                      <span className="text-foreground">corrected by hand</span>
                    ) : row.source === 'pos' ? (
                      <span className="text-muted-foreground">POS</span>
                    ) : (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </td>

                  {canAdjust && (
                    <td className="py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          max={24}
                          step="0.25"
                          inputMode="decimal"
                          aria-label={`Hours for ${row.weekday} ${fmtDate(row.date)}`}
                          placeholder={row.hasShift ? row.hours.toFixed(2) : '0.00'}
                          value={drafts[row.date] ?? ''}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [row.date]: e.target.value }))
                          }
                          className="h-8 w-20 tabular-nums"
                        />
                        <Button
                          type="button"
                          size="icon-sm"
                          variant={changed ? 'default' : 'outline'}
                          disabled={!changed || savingDate !== null}
                          aria-label={`Save ${row.weekday} ${fmtDate(row.date)}`}
                          onClick={() => save(row)}
                        >
                          {savingDate === row.date ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Check className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The total, and the only place the regular/overtime split is real. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md bg-muted px-3 py-2 text-sm">
        <span className="font-medium">
          Period total{' '}
          <span className="tabular-nums">{totalHours.toFixed(2)} hrs</span>
          {dirty && <span className="ml-2 text-xs text-amber-600 dark:text-amber-300">unsaved</span>}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          Regular {split.regularHours.toFixed(2)} · Overtime {split.overtimeHours.toFixed(2)}
          <span className="ml-1">(over {WEEKLY_OVERTIME_THRESHOLD} hrs a week)</span>
        </span>
      </div>

      {canAdjust && (
        <div className="space-y-1.5">
          <Label htmlFor={`days-reason-${employeeId}`} className="text-xs">
            Reason
          </Label>
          <Input
            id={`days-reason-${employeeId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Forgot to clock out Friday"
            className="h-8"
          />
          <p className="text-xs text-muted-foreground">
            Saved against every night you change here, and kept in the pay log so
            &ldquo;why is my cheque different&rdquo; has an answer three weeks later.
          </p>
        </div>
      )}
    </div>
  );
}
