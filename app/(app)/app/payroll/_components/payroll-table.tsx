'use client';

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
  totals: {
    totalHours: number;
    regularPay: number;
    overtimePay: number;
    tips: number;
    totalCompensation: number;
  };
}

export default function PayrollTable({ entries, totals }: PayrollTableProps) {
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

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="pl-4">Employee</TableHead>
            <TableHead>Role</TableHead>
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry, i) => (
            <TableRow
              key={entry.employeeId}
              className={i % 2 === 1 ? 'bg-muted/20' : ''}
            >
              <TableCell className="pl-4 font-medium">{entry.employeeName}</TableCell>
              <TableCell className="capitalize text-sm text-muted-foreground">
                {entry.role ?? <span className="italic">—</span>}
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
                  <span className="text-amber-600 dark:text-amber-300">{fmt(entry.overtimePay)}</span>
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
            </TableRow>
          ))}

          {/* Totals row */}
          <TableRow className="border-t-2 bg-muted/40 font-semibold hover:bg-muted/40">
            <TableCell className="pl-4" colSpan={2}>
              Totals
            </TableCell>
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
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
