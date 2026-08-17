'use client';

import { useState } from 'react';
import { Download, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { PayrollEntry } from '../../actions';

interface Props {
  entries:      PayrollEntry[];
  startDate:    string;
  endDate:      string;
  periodLabel:  string;
  orgName:      string;
  exportOnly?:  boolean; // true = render only the export button (used in sticky header)
}

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

export function PayrollReviewClient({ entries, startDate, endDate, periodLabel, orgName, exportOnly }: Props) {
  const [confirmed, setConfirmed] = useState(false);

  function downloadCsv() {
    const header = [
      'Employee', 'Role', 'Rate ($/hr)',
      'Regular Hrs', 'OT Hrs', 'Total Hrs',
      'Regular Pay', 'OT Pay', 'Tips', 'Total Compensation',
    ];

    const rows = entries.map(e => [
      e.employeeName,
      e.role ?? '',
      e.hourlyRate != null ? e.hourlyRate.toFixed(2) : '',
      e.regularHours.toFixed(2),
      e.overtimeHours.toFixed(2),
      e.totalHours.toFixed(2),
      e.regularPay.toFixed(2),
      e.overtimePay.toFixed(2),
      e.tipAmount.toFixed(2),
      e.totalCompensation.toFixed(2),
    ]);

    const totals = entries.reduce(
      (a, e) => ({
        reg: a.reg + e.regularHours,
        ot:  a.ot  + e.overtimeHours,
        tot: a.tot + e.totalHours,
        rp:  a.rp  + e.regularPay,
        op:  a.op  + e.overtimePay,
        tp:  a.tp  + e.tipAmount,
        tc:  a.tc  + e.totalCompensation,
      }),
      { reg: 0, ot: 0, tot: 0, rp: 0, op: 0, tp: 0, tc: 0 },
    );
    rows.push(['TOTAL', '', '', totals.reg.toFixed(2), totals.ot.toFixed(2), totals.tot.toFixed(2), totals.rp.toFixed(2), totals.op.toFixed(2), totals.tp.toFixed(2), totals.tc.toFixed(2)]);

    const meta = [
      [`Rail Payroll Export — ${orgName}`],
      [`Period: ${periodLabel}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
    ];

    const csv = [
      ...meta.map(r => r.map(v => `"${v}"`).join(',')),
      header.map(h => `"${h}"`).join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `payroll-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Payroll exported — share with your payroll provider or accountant.');
  }

  async function downloadNacha() {
    const url = `/api/payroll/nacha?startDate=${startDate}&endDate=${endDate}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string; detail?: string };
      toast.error(err.detail ?? err.error ?? 'NACHA generation failed');
      return;
    }
    const blob     = await res.blob();
    const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
      ?? `payroll-ach-${startDate}-to-${endDate}.ach`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);

    const skipped = res.headers.get('X-Skipped-Employees');
    const total   = res.headers.get('X-NACHA-Total');
    toast.success(`NACHA file downloaded — $${total} across ${res.headers.get('X-NACHA-Entries')} entries.`);
    if (skipped) toast.warning(`Skipped (no DD on file): ${skipped}`, { duration: 8000 });
  }

  if (exportOnly) {
    return (
      <div className="flex gap-2 shrink-0">
        <Button size="sm" variant="outline" onClick={downloadCsv} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> CSV
        </Button>
        <Button size="sm" variant="outline" onClick={downloadNacha} className="gap-1.5 text-primary border-primary/40 hover:bg-primary/5">
          <Download className="h-3.5 w-3.5" /> NACHA File
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={downloadCsv} className="gap-2">
        <Download className="h-4 w-4" /> Export CSV
      </Button>
      <Button variant="outline" onClick={downloadNacha} className="gap-2 text-primary border-primary/40 hover:bg-primary/5">
        <Download className="h-4 w-4" /> Download NACHA File
      </Button>

      {!confirmed ? (
        <Button
          onClick={() => {
            setConfirmed(true);
            toast.success('Payroll confirmed for this period. Provide the exported CSV to your payroll provider to process payments.');
          }}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <CheckCircle className="h-4 w-4" />
          Confirm Payroll
        </Button>
      ) : (
        <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle className="h-4 w-4" />
          Confirmed — provide CSV to your payroll provider
        </div>
      )}
    </div>
  );
}
