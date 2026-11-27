'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { PayrollEntry } from '../../actions';

const NACHA_NEEDS_APPROVAL = 'The bank file unlocks once an owner approves this pay run.';

interface Props {
  entries:      PayrollEntry[];
  startDate:    string;
  endDate:      string;
  periodLabel:  string;
  orgName:      string;
  approved:     boolean; // the bank file is refused until the run is approved; say so instead of inviting the click
  exportOnly?:  boolean; // true = render only the export button (used in sticky header)
}

export function PayrollReviewClient({ entries, startDate, endDate, periodLabel, orgName, approved, exportOnly }: Props) {
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
      [`Rail Payroll Export: ${orgName}`],
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
    toast.success('Payroll exported. Share with your payroll provider or accountant.');
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
    toast.success(`NACHA file downloaded: $${total} across ${res.headers.get('X-NACHA-Entries')} entries.`);
    if (skipped) toast.warning(`Skipped (no DD on file): ${skipped}`, { duration: 8000 });
  }

  if (exportOnly) {
    return (
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={downloadCsv} className="min-h-11 gap-1.5 sm:min-h-0">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={downloadNacha} disabled={!approved} aria-describedby={approved ? undefined : 'nacha-reason-hdr'} className="min-h-11 gap-1.5 text-primary border-primary/40 hover:bg-primary/5 sm:min-h-0">
            <Download className="h-3.5 w-3.5" /> NACHA File
          </Button>
        </div>
        {!approved && <p id="nacha-reason-hdr" className="text-xs text-muted-foreground">{NACHA_NEEDS_APPROVAL}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={downloadCsv} className="min-h-11 gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
        <Button variant="outline" onClick={downloadNacha} disabled={!approved} aria-describedby={approved ? undefined : 'nacha-reason'} className="min-h-11 gap-2 text-primary border-primary/40 hover:bg-primary/5">
          <Download className="h-4 w-4" /> Download NACHA File
        </Button>
      </div>
      {!approved && <p id="nacha-reason" className="text-sm text-muted-foreground">{NACHA_NEEDS_APPROVAL}</p>}
    </div>
  );
}
