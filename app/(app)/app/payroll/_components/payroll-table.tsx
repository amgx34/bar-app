'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal, ChevronRight } from 'lucide-react';
import { AdjustDialog } from './adjust-dialog';
import { EmployeeDaysPanel } from './employee-days-panel';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PayrollEntry } from '../actions';

interface PayrollTableProps {
  entries: PayrollEntry[];
  /** Period bounds, so an adjustment can only be dated inside what is shown. */
  startDate?: string;
  endDate?: string;
  /** Hidden for roles that may not change pay. */
  canAdjust?: boolean;
  totals: {
    totalHours: number;
    regularPay: number;
    overtimePay: number;
    tips: number;
    totalCompensation: number;
  };
}

/**
 * Roles are paid on different terms and get reconciled separately — whoever is
 * checking a run looks at the bartenders as a block, then the barbacks, then
 * security. One flat list made that a manual exercise with a calculator.
 *
 * These three lead because they are the ones compared against each other.
 * Anything else follows alphabetically, with unassigned last so it reads as the
 * exception it is rather than hiding in the middle.
 */
const ROLE_ORDER = ['bartender', 'barback', 'security'] as const;

const ROLE_LABEL: Record<string, string> = {
  bartender: 'Bartenders',
  barback: 'Barbacks',
  security: 'Security',
  server: 'Servers',
  manager: 'Managers',
  other: 'Other',
};

const UNASSIGNED = '__unassigned__';

type Subtotal = {
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  regularPay: number;
  overtimePay: number;
  tips: number;
  totalCompensation: number;
};

const EMPTY: Subtotal = {
  regularHours: 0,
  overtimeHours: 0,
  totalHours: 0,
  regularPay: 0,
  overtimePay: 0,
  tips: 0,
  totalCompensation: 0,
};

function accumulate(into: Subtotal, e: PayrollEntry): Subtotal {
  return {
    regularHours: into.regularHours + e.regularHours,
    overtimeHours: into.overtimeHours + e.overtimeHours,
    totalHours: into.totalHours + e.totalHours,
    regularPay: into.regularPay + e.regularPay,
    overtimePay: into.overtimePay + e.overtimePay,
    tips: into.tips + e.tipAmount,
    totalCompensation: into.totalCompensation + e.totalCompensation,
  };
}

/** Buckets entries by role, in the reading order described above. */
function groupByRole(entries: PayrollEntry[]) {
  const byRole = new Map<string, PayrollEntry[]>();

  for (const entry of entries) {
    // Normalised so "Bartender" and "bartender" are one group rather than two.
    const key = entry.role?.trim().toLowerCase() || UNASSIGNED;
    const bucket = byRole.get(key);
    if (bucket) bucket.push(entry);
    else byRole.set(key, [entry]);
  }

  const rank = (role: string) => {
    const lead = ROLE_ORDER.indexOf(role as (typeof ROLE_ORDER)[number]);
    if (lead >= 0) return lead;
    if (role === UNASSIGNED) return 999;
    return 100;
  };

  return [...byRole.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([role, rows]) => ({
      role,
      label: role === UNASSIGNED ? 'No role set' : (ROLE_LABEL[role] ?? role),
      rows: [...rows].sort((x, y) => x.employeeName.localeCompare(y.employeeName)),
      subtotal: rows.reduce(accumulate, EMPTY),
    }));
}

export default function PayrollTable({
  entries,
  totals,
  startDate,
  endDate,
  canAdjust = false,
}: PayrollTableProps) {
  const [adjusting, setAdjusting] = useState<PayrollEntry | null>(null);
  // Which employee's nights are open. One at a time: the panel is a detail
  // view of the row above it, and several open at once turns the pay run into
  // a wall nobody can scan.
  const [openDays, setOpenDays] = useState<string | null>(null);
  const router = useRouter();
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center">
        <p className="text-muted-foreground font-medium">No payroll data for this period</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Import employee worked reports to see payroll
        </p>
      </div>
    );
  }

  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const groups = groupByRole(entries);

  // Weighted, never a mean of the per-person figures: two hours must not move
  // the number as much as forty.
  const effective = (t: Subtotal) => (t.totalHours > 0 ? t.totalCompensation / t.totalHours : 0);
  const tipsPerHour = (t: Subtotal) => (t.totalHours > 0 ? t.tips / t.totalHours : 0);

  // The Role column is gone — every group is a single role, so repeating it on
  // each row was noise. That leaves ten columns.
  const COLUMNS = canAdjust ? 11 : 10;

  return (
    <>
      {/* Phones get cards, not a sideways-scrolling grid.
          Eleven columns cannot be made to fit a 375px screen, and a manager
          checking a run on the bar floor reads one person at a time anyway.
          Both layouts are built from the same `groups` array, so they cannot
          drift apart. */}
      <div className="space-y-5 sm:hidden">
        {groups.map((group) => (
          <section key={group.role} className="space-y-2">
            <h3 className="flex items-baseline gap-2 px-1">
              <span className="font-heading text-xs font-semibold uppercase tracking-wider">
                {group.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {group.rows.length} {group.rows.length === 1 ? 'person' : 'people'}
              </span>
            </h3>

            {group.rows.map((entry) => (
              <div key={entry.employeeId} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className="align-middle">{entry.employeeName}</span>
                      {entry.payType === 'hourly' && (
                      /* Without this an hourly barback's $0 tips reads as a
                         broken split rather than the arrangement they are on.
                         The title is load-bearing: such a person CAN still hold
                         tips, because a manual transfer is a deliberate act and
                         is applied after the split. "Hourly only" alone next to
                         a non-zero figure reads as a contradiction. */
                      <span
                        title="Paid an hourly wage and draws nothing from the tip pool. Tips moved to them by hand still apply."
                        className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 align-middle text-[11px] font-medium text-muted-foreground"
                      >
                        No pool share
                      </span>
                    )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setOpenDays((cur) => (cur === entry.employeeId ? null : entry.employeeId))}
                      aria-expanded={openDays === entry.employeeId}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      {/* The total itself opens the nights behind it — on a phone
                          that is the figure being questioned, so it is the thing
                          worth making tappable. */}
                      {entry.totalHours.toFixed(2)} hrs @ ${entry.hourlyRate.toFixed(2)}
                      <ChevronRight
                        className={`h-3 w-3 transition-transform ${openDays === entry.employeeId ? 'rotate-90' : ''}`}
                        aria-hidden
                      />
                    </button>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="tabular-nums text-lg font-semibold text-primary">
                      {fmt(entry.totalCompensation)}
                    </span>
                    {canAdjust && (
                      <button
                        type="button"
                        onClick={() => setAdjusting(entry)}
                        aria-label={`Adjust ${entry.employeeName}`}
                        // 44px — the smallest reliably tappable target on a phone.
                        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <SlidersHorizontal className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Reg. hrs</dt>
                    <dd className="tabular-nums">{entry.regularHours.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">OT hrs</dt>
                    <dd className={`tabular-nums ${entry.overtimeHours > 0 ? 'font-medium text-amber-600 dark:text-amber-300' : 'text-muted-foreground'}`}>
                      {entry.overtimeHours.toFixed(2)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Reg. pay</dt>
                    <dd className="tabular-nums">{fmt(entry.regularPay)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">OT pay</dt>
                    <dd className={`tabular-nums ${entry.overtimePay > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-muted-foreground'}`}>
                      {fmt(entry.overtimePay)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Tips</dt>
                    <dd className="tabular-nums text-cyan-700 dark:text-cyan-300">
                      {fmt(entry.tipAmount)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Eff. /hr</dt>
                    <dd className="tabular-nums">
                      {entry.totalHours > 0 ? fmt(entry.effectiveHourlyRate) : '—'}
                    </dd>
                  </div>
                </dl>

                {openDays === entry.employeeId && startDate && endDate && (
                  <div className="mt-3 border-t pt-3">
                    <EmployeeDaysPanel
                      employeeId={entry.employeeId}
                      employeeName={entry.employeeName}
                      startDate={startDate}
                      endDate={endDate}
                      canAdjust={canAdjust}
                      onSaved={() => router.refresh()}
                    />
                  </div>
                )}
              </div>
            ))}

            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5 text-sm">
              <span className="font-medium text-muted-foreground">{group.label} subtotal</span>
              <span className="tabular-nums font-semibold">
                {group.subtotal.totalHours.toFixed(2)} hrs · {fmt(group.subtotal.totalCompensation)}
              </span>
            </div>
          </section>
        ))}

        <div className="rounded-xl border-2 bg-card p-4">
          <div className="flex items-baseline justify-between">
            <span className="font-heading text-sm font-semibold uppercase tracking-wider">Totals</span>
            <span className="tabular-nums text-xl font-bold text-primary">
              {fmt(totals.totalCompensation)}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Total hrs</dt>
              <dd className="tabular-nums">{totals.totalHours.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tips</dt>
              <dd className="tabular-nums text-cyan-700 dark:text-cyan-300">{fmt(totals.tips)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Reg. pay</dt>
              <dd className="tabular-nums">{fmt(totals.regularPay)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">OT pay</dt>
              <dd className="tabular-nums text-amber-600 dark:text-amber-300">{fmt(totals.overtimePay)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="hidden overflow-x-auto rounded-xl border sm:block">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="pl-4">Employee</TableHead>
            <TableHead className="text-right">Reg. Hrs</TableHead>
            <TableHead className="text-right">OT Hrs</TableHead>
            <TableHead className="text-right">Total Hrs</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Reg. Pay</TableHead>
            <TableHead className="text-right">OT Pay</TableHead>
            <TableHead className="text-right">Tips</TableHead>
            <TableHead className="text-right" title="Base rate plus tips per hour worked">
              Eff. /hr
            </TableHead>
            <TableHead className="pr-4 text-right font-semibold">Total Pay</TableHead>
            {canAdjust && <TableHead className="w-10"><span className="sr-only">Adjust</span></TableHead>}
          </TableRow>
        </TableHeader>

        <TableBody>
          {groups.map((group) => (
            <RoleBlock key={group.role}>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableCell colSpan={COLUMNS} className="py-2 pl-4">
                  <span className="font-heading text-xs font-semibold uppercase tracking-wider">
                    {group.label}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {group.rows.length} {group.rows.length === 1 ? 'person' : 'people'}
                  </span>
                </TableCell>
              </TableRow>

              {group.rows.map((entry, i) => [
                <TableRow
                  key={entry.employeeId}
                  className={i % 2 === 1 ? 'bg-muted/20' : ''}
                >
                  <TableCell className="pl-4 font-medium whitespace-normal">
                    {/* The period total on this row is the sum of nights that
                        were never shown anywhere. This opens them. */}
                    <button
                      type="button"
                      onClick={() => setOpenDays((cur) => (cur === entry.employeeId ? null : entry.employeeId))}
                      aria-expanded={openDays === entry.employeeId}
                      aria-label={`Show each night for ${entry.employeeName}`}
                      className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded align-middle text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ChevronRight
                        className={`h-3.5 w-3.5 transition-transform ${openDays === entry.employeeId ? 'rotate-90' : ''}`}
                        aria-hidden
                      />
                    </button>
                    <span className="align-middle">{entry.employeeName}</span>
                    {entry.payType === 'hourly' && (
                      /* Without this an hourly barback's $0 tips reads as a
                         broken split rather than the arrangement they are on. */
                      <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 align-middle text-[11px] font-medium text-muted-foreground">
                        Hourly only
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {entry.regularHours.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {entry.overtimeHours > 0 ? (
                      <span className="font-medium text-amber-600 dark:text-amber-300">
                        {entry.overtimeHours.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0.00</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {entry.totalHours.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground text-sm">
                    ${entry.hourlyRate.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(entry.regularPay)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {entry.overtimePay > 0 ? (
                      <span className="text-amber-600 dark:text-amber-300">
                        {fmt(entry.overtimePay)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">$0.00</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-cyan-700 dark:text-cyan-300">
                    {fmt(entry.tipAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {entry.totalHours > 0 ? (
                      <>
                        <span className="font-medium">{fmt(entry.effectiveHourlyRate)}</span>
                        <span className="block text-xs text-muted-foreground">
                          +{fmt(entry.tipsPerHour)} tips
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-right tabular-nums font-semibold text-primary">
                    {fmt(entry.totalCompensation)}
                  </TableCell>
                  {canAdjust && (
                    <TableCell className="pr-2">
                      <button
                        type="button"
                        onClick={() => setAdjusting(entry)}
                        aria-label={`Adjust ${entry.employeeName}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors cursor-pointer"
                      >
                        <SlidersHorizontal className="h-4 w-4" aria-hidden />
                      </button>
                    </TableCell>
                  )}
                </TableRow>,
                openDays === entry.employeeId && startDate && endDate ? (
                  <TableRow key={`${entry.employeeId}-days`} className="hover:bg-transparent">
                    <TableCell colSpan={COLUMNS} className="p-3">
                      <EmployeeDaysPanel
                        employeeId={entry.employeeId}
                        employeeName={entry.employeeName}
                        startDate={startDate}
                        endDate={endDate}
                        canAdjust={canAdjust}
                        onSaved={() => router.refresh()}
                      />
                    </TableCell>
                  </TableRow>
                ) : null,
              ]).flat()}

              {/* Shown even for a single person, so every block reads the same
                  way down the page. */}
              <TableRow className="border-t bg-background hover:bg-background">
                <TableCell className="pl-4 text-sm font-medium text-muted-foreground">
                  {group.label} subtotal
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {group.subtotal.regularHours.toFixed(2)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm text-amber-600 dark:text-amber-300">
                  {group.subtotal.overtimeHours.toFixed(2)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm font-medium">
                  {group.subtotal.totalHours.toFixed(2)}
                </TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums text-sm">
                  {fmt(group.subtotal.regularPay)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm text-amber-600 dark:text-amber-300">
                  {fmt(group.subtotal.overtimePay)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm text-cyan-700 dark:text-cyan-300">
                  {fmt(group.subtotal.tips)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {group.subtotal.totalHours > 0 ? (
                    <>
                      <span>{fmt(effective(group.subtotal))}</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        +{fmt(tipsPerHour(group.subtotal))} tips
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </TableCell>
                <TableCell className="pr-4 text-right tabular-nums text-sm font-medium">
                  {fmt(group.subtotal.totalCompensation)}
                </TableCell>
                {canAdjust && <TableCell />}
              </TableRow>
            </RoleBlock>
          ))}

          {/* Grand total. Hours and pay come from the caller's own figures
              rather than being re-derived here, so this row cannot disagree
              with the numbers the rest of the page is built from. */}
          <TableRow className="border-t-2 bg-muted/40 font-semibold hover:bg-muted/40">
            <TableCell className="pl-4">Totals</TableCell>
            <TableCell className="text-right tabular-nums">
              {entries.reduce((s, e) => s + e.regularHours, 0).toFixed(2)}
            </TableCell>
            <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-300">
              {entries.reduce((s, e) => s + e.overtimeHours, 0).toFixed(2)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{totals.totalHours.toFixed(2)}</TableCell>
            <TableCell />
            <TableCell className="text-right tabular-nums">{fmt(totals.regularPay)}</TableCell>
            <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-300">
              {fmt(totals.overtimePay)}
            </TableCell>
            <TableCell className="text-right tabular-nums text-cyan-700 dark:text-cyan-300">
              {fmt(totals.tips)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {totals.totalHours > 0 ? (
                <>
                  <span>{fmt(totals.totalCompensation / totals.totalHours)}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    +{fmt(totals.tips / totals.totalHours)} tips
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">&mdash;</span>
              )}
            </TableCell>
            <TableCell className="pr-4 text-right tabular-nums text-primary">
              {fmt(totals.totalCompensation)}
            </TableCell>
            {canAdjust && <TableCell />}
          </TableRow>
        </TableBody>
      </Table>
      </div>

      {/* Mounted only while open: the form holds its own state, and keeping one
          instance per table would reset nothing and cost a render on every row
          change. Shared by both layouts. */}
      {canAdjust && adjusting && (
        <AdjustDialog
          open={!!adjusting}
          onOpenChange={(o) => !o && setAdjusting(null)}
          entry={adjusting}
          everyone={entries}
          startDate={startDate ?? ''}
          endDate={endDate ?? ''}
        />
      )}
    </>
  );
}

/**
 * Transparent wrapper so each role block is a single child of TableBody.
 * A bare fragment would do; naming it makes the grouping legible in devtools.
 */
function RoleBlock({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
