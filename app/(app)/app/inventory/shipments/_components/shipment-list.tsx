'use client';

import { useState } from 'react';
import { Truck, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ShipmentSummary } from '../../shipment-actions';
import { LogShipmentDialog } from './log-shipment-dialog';

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A whole cent of drift is not rounding — it is two documents disagreeing
// about a fact. Anything under that is float noise from summing dollars.
const DISCREPANCY_THRESHOLD = 0.01;

function formatDate(iso: string) {
  // invoiceDate is YYYY-MM-DD with no time component. Parsing it with `new
  // Date(iso)` reads it as UTC midnight, which prints as the day *before* in
  // any timezone west of UTC — an invoice dated the 5th showing as the 4th.
  // Splitting it out and building a local date sidesteps that entirely.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The shipments log: one row per invoice posted through Task 8's dialog.
 *
 * The one thing this screen must never bury is a shipment that does not tie
 * out to its own paperwork — invoiceTotal is what the vendor billed,
 * computedTotal is what Rail actually posted to stock (lines + freight + tax
 * + other + deposits), and when a human mistyped a line or the AI parse
 * missed a charge those two numbers drift apart silently unless flagged here.
 */
export function ShipmentList({
  shipments,
  canEdit,
}: {
  shipments: ShipmentSummary[];
  canEdit: boolean;
}) {
  // Owned here, not in the page: the page is a server component and this is
  // the one client boundary on the screen already gated on `canEdit`, so the
  // dialog's open state and its trigger both live beside each other.
  const [dialogOpen, setDialogOpen] = useState(false);

  if (shipments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-14 text-center">
        <Truck className="h-8 w-8 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-medium text-muted-foreground">No shipments logged yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {canEdit
              ? 'Log a delivery invoice here to post its cost to stock and keep a record of what each vendor billed against what actually came in.'
              : 'Once a manager logs a delivery invoice, it will post its cost to stock and show up here.'}
          </p>
        </div>
        {/*
          The reserved slot from Task 7: the trigger is gated on the same
          `canEdit` the text above already branches on, so a staff-role user
          sees the explanatory copy with no dead button beneath it.
        */}
        {canEdit && (
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Log a shipment
          </Button>
        )}
        <LogShipmentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex items-center justify-end">
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Log a shipment
          </Button>
        </div>
      )}
      <div className="rounded-xl border">
        {/*
          Table itself (components/ui/table) already wraps in
          `overflow-x-auto` on its own container, so wide rows scroll inside
          that box instead of widening the page — see the min-w-0 comment in
          ../../layout.tsx and payroll-table.tsx for the failure mode this
          avoids: a table sized to its min-content pushes the whole document
          wider than the viewport on a phone, and no wrapper div fixes that
          after the fact.
        */}
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Invoice #</TableHead>
            <TableHead className="text-right">Lines</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Invoice total</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {shipments.map((s) => {
            const discrepancy =
              s.invoiceTotal !== null && Math.abs(s.invoiceTotal - s.computedTotal) > DISCREPANCY_THRESHOLD
                ? s.invoiceTotal - s.computedTotal
                : null;

            return (
              <TableRow key={s.id} className={s.voided ? 'opacity-60' : undefined}>
                <TableCell className="tabular-nums">{formatDate(s.invoiceDate)}</TableCell>
                <TableCell className="font-medium">{s.vendorName}</TableCell>
                <TableCell className="text-muted-foreground">{s.invoiceNumber ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{s.lineCount}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {money(s.computedTotal)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.invoiceTotal === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-col items-end">
                      <span>{money(s.invoiceTotal)}</span>
                      {discrepancy !== null && (
                        // The single most useful fact this screen can surface:
                        // what Rail posted does not match what the vendor
                        // billed. Shown as a signed delta so "we posted more
                        // than the invoice says" and "we posted less" read
                        // differently at a glance.
                        <span
                          className="text-xs font-medium text-amber-600 dark:text-amber-400"
                          title="Invoice total minus computed total — does not tie out to the invoice"
                        >
                          {discrepancy > 0 ? '+' : ''}
                          {money(discrepancy)} off
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {s.voided && (
                    <Badge variant="destructive">Voided</Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
      <LogShipmentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
