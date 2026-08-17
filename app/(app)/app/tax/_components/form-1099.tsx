'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Printer, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { getYearlyPayrollData } from '../actions';
import { US_STATES, fmtMoney, openPrint, DISCLAIMER_HTML } from './shared';
import type { PayrollEntry } from '../../payroll/actions';

interface Props {
  availableYears: number[];
  employees: { id: string; name: string; role: string | null }[];
  orgName: string;
}

export default function Form1099({ availableYears, employees, orgName }: Props) {
  const [year, setYear] = useState(availableYears[0] ?? new Date().getFullYear());
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [ein, setEin] = useState('');
  const [street, setStreet] = useState('');
  const [zip, setZip] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<PayrollEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const { entries: data } = await getYearlyPayrollData(year);
      setEntries(data.filter(e => e.totalCompensation >= 600));
      if (data.filter(e => e.totalCompensation >= 600).length === 0) {
        toast.error('No workers paid $600+ found for this year');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  function toggleAll(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) setSelected(new Set(entries?.map(e => e.employeeId) ?? []));
    else setSelected(new Set());
  }

  function print1099(entry: PayrollEntry) {
    const total = entry.totalCompensation;
    const stateInfo = US_STATES.find(s => s.code === state);

    const body = `
      ${DISCLAIMER_HTML}
      <h1>1099-NEC NONEMPLOYEE COMPENSATION</h1>
      <p class="subtitle">Tax Year ${year} — VOID if paid as W-2 employee</p>

      <div class="section">
        <div class="grid2">
          <div class="box">
            <div class="box-label">PAYER'S name, street address, city, state, ZIP</div>
            <div class="box-value">${orgName}</div>
            <div style="font-size:9pt">${street ? street + ', ' : ''}${city ? city + ', ' : ''}${stateInfo?.name ?? state ?? ''} ${zip}</div>
          </div>
          <div class="box">
            <div class="box-label">PAYER'S TIN (EIN)</div>
            <div class="box-value">${ein || '<span class="needs-fill">XX-XXXXXXX [FILL IN]</span>'}</div>
          </div>
          <div class="box">
            <div class="box-label">RECIPIENT'S name</div>
            <div class="box-value">${entry.employeeName}</div>
          </div>
          <div class="box">
            <div class="box-label">RECIPIENT'S TIN (SSN)</div>
            <div class="box-value needs-fill">___-__-____ [FILL IN]</div>
          </div>
          <div class="box full">
            <div class="box-label">Street address (recipient)</div>
            <div class="box-value needs-fill">[FILL IN]</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="grid3">
          <div class="box">
            <div class="box-num">1</div>
            <div class="box-label">Nonemployee compensation</div>
            <div class="box-value">${fmtMoney(total)}</div>
          </div>
          <div class="box">
            <div class="box-num">4</div>
            <div class="box-label">Federal income tax withheld</div>
            <div class="box-value needs-fill">$0.00 [VERIFY]</div>
          </div>
          <div class="box">
            <div class="box-num">5</div>
            <div class="box-label">State tax withheld</div>
            <div class="box-value needs-fill">$0.00 [VERIFY]</div>
          </div>
          <div class="box">
            <div class="box-num">6</div>
            <div class="box-label">State/Payer's state no.</div>
            <div class="box-value">${stateInfo?.name ?? '<span class="needs-fill">[FILL IN]</span>'}</div>
          </div>
          <div class="box">
            <div class="box-num">7</div>
            <div class="box-label">State income</div>
            <div class="box-value">${stateInfo?.noIncomeTax ? '$0.00 (no state tax)' : fmtMoney(total)}</div>
          </div>
        </div>
      </div>

      <div class="footnote">
        <strong>Important:</strong> A 1099-NEC is only required if this worker is truly a <em>nonemployee</em> (independent contractor).
        If this person is a regular employee, a W-2 is required instead — not a 1099-NEC.
        The IRS threshold is $600 total payments per tax year. Amount shown: ${fmtMoney(total)} (wages ${fmtMoney(entry.regularPay + entry.overtimePay)} + tips ${fmtMoney(entry.tipAmount)}).
        <br><br>Rail does not determine worker classification. Consult a tax professional to confirm whether W-2 or 1099 applies.
        This is NOT a valid IRS form. Do not file without professional review.
      </div>`;

    openPrint(`1099-NEC ${year} — ${entry.employeeName}`, body);
  }

  const allChecked = entries ? entries.length > 0 && selected.size === entries.length : false;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-amber-500/5 border-amber-500/20 p-4 text-sm text-amber-300 space-y-1">
        <p className="font-semibold">Before generating 1099-NECs:</p>
        <p className="text-amber-300/70 text-xs leading-relaxed">
          1099-NEC forms are for <strong>independent contractors</strong> (non-employees) paid $600 or more.
          Regular bar staff on the payroll receive W-2s, not 1099s. Misclassifying employees as contractors carries serious IRS penalties.
          Have a tax professional confirm worker classification before filing.
        </p>
      </div>

      {/* Config */}
      <div className="rounded-xl border bg-card p-5 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Payer & Period</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Tax Year</Label>
            <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); setEntries(null); }}>
              <SelectTrigger className="h-9">{year}</SelectTrigger>
              <SelectContent>{availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Payer EIN</Label>
            <Input placeholder="XX-XXXXXXX" value={ein} onChange={e => setEin(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Street Address</Label>
            <Input placeholder="123 Main St" value={street} onChange={e => setStreet(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ZIP</Label>
            <Input placeholder="10001" value={zip} onChange={e => setZip(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">State</Label>
            <Select value={state} onValueChange={(v) => setState(v ?? '')}>
              <SelectTrigger className="h-9">
                <span className="truncate text-sm">{state ? US_STATES.find(s => s.code === state)?.name : 'Select state'}</span>
              </SelectTrigger>
              <SelectContent>{US_STATES.map(s => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">City</Label>
            <Input placeholder="City" value={city} onChange={e => setCity(e.target.value)} className="h-9" />
          </div>
          <div className="lg:col-span-2 flex items-end">
            <Button onClick={generate} disabled={loading} className="w-full h-9 gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {loading ? 'Loading…' : 'Load Workers ($600+)'}
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      {entries && entries.length === 0 && (
        <p className="text-center text-muted-foreground py-8 text-sm">No workers paid $600+ in {year}.</p>
      )}

      {entries && entries.length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <div className="px-5 py-3 border-b bg-muted/30 flex items-center gap-3">
            <input type="checkbox" checked={allChecked} onChange={toggleAll} className="rounded" />
            <p className="text-sm font-semibold flex-1">{entries.length} worker{entries.length !== 1 ? 's' : ''} found · {selected.size} selected</p>
            {selected.size > 0 && (
              <Button size="sm" variant="outline" onClick={() => [...selected].forEach(id => {
                const e = entries.find(e => e.employeeId === id);
                if (e) setTimeout(() => print1099(e), 100);
              })} className="gap-2 text-xs">
                <Printer className="h-3.5 w-3.5" /> Print Selected
              </Button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="w-10 px-4 py-2.5" />
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Total Paid (Box 1)</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map(entry => (
                <tr key={entry.employeeId}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(entry.employeeId)}
                      onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(entry.employeeId) : n.delete(entry.employeeId); return n; })}
                      className="rounded" />
                  </td>
                  <td className="px-4 py-3 font-medium">{entry.employeeName}
                    <span className="ml-2 text-xs text-muted-foreground capitalize">{entry.role}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-300 font-semibold">{fmtMoney(entry.totalCompensation)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => print1099(entry)} className="gap-1.5 text-xs h-7">
                      <Printer className="h-3 w-3" /> Print
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
