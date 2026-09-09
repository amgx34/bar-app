'use client';

import type { DayValue } from '@/lib/payroll/day-value';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * The nights in this period, tickable.
 *
 * Shows every recorded night rather than only the unpaid ones, because days are
 * never settled — there is no such thing as a night that has been paid for. The
 * ticks choose what to base an amount on, nothing more.
 */
export function DayPicker({
  days,
  selected,
  onToggle,
}: {
  days: DayValue[];
  selected: ReadonlySet<string>;
  onToggle: (date: string) => void;
}) {
  if (days.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No shifts recorded in this period yet.
      </p>
    );
  }

  return (
    <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-1">
      {days.map((d) => (
        <label
          key={d.date}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted"
        >
          <input
            type="checkbox"
            checked={selected.has(d.date)}
            onChange={() => onToggle(d.date)}
            className="h-4 w-4 shrink-0"
          />
          <span className="min-w-0 flex-1 text-sm">
            {d.date}
            <span className="ml-2 text-xs text-muted-foreground">
              {d.hours.toLocaleString()} hrs
              {d.overtimeHours > 0 && ` · ${d.overtimeHours.toLocaleString()} OT`}
            </span>
          </span>
          <span className="shrink-0 text-sm tabular-nums">{money(d.total)}</span>
        </label>
      ))}
    </div>
  );
}
