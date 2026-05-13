'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Printer, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { getYearlyPayrollData } from '../actions';
import { US_STATES, ssWageBase, fmtMoney, openPrint, DISCLAIMER_HTML } from './shared';
import type { PayrollEntry } from '../../payroll/actions';

interface Props {
  availableYears: number[];
  employees: { id: string; name: string; role: string | null }[];
  orgName: string;
}

export default function W2Generator({ availableYears, employees, orgName }: Props) {
  const [year, setYear] = useState(availableYears[0] ?? new Date().getFullYear());
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [ein, setEin] = useState('');
  const [street, setStreet] = useState('');
  const [zip, setZip] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('all');
  const [entries, setEntries] = useState<PayrollEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const { entries: data } = await getYearlyPayrollData(year);
      setEntries(data);
      if (data.length === 0) toast.error('No payroll data found for this year');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  }

  function printW2(entry: PayrollEntry) {
    const base = ssWageBase(year);
    const wages = entry.regularPay + entry.overtimePay + entry.tipAmount;
    const ssWages = Math.min(wages, base);
    const stateInfo = US_STATES.find(s => s.code === state);

    const body = `
      ${DISCLAIMER_HTML}
      <h1>W-2 WAGE AND TAX STATEMENT</h1>
      <p class="subtitle">Tax Year ${year} — Copy B: Employee Federal Return</p>

      <div class="section">
        <div class="grid2">
          <div class="box">
            <div class="box-label">a. Employee's social security number</div>
            <div class="box-value needs-fill">___-__-____ [FILL IN]</div>
          </div>
          <div class="box">
            <div class="box-num">b.</div>
            <div class="box-label">Employer identification number (EIN)</div>
            <div class="box-value">${ein || '<span class="needs-fill">XX-XXXXXXX [FILL IN]</span>'}</div>
          </div>
          <div class="box full">
            <div class="box-label">c. Employer's name, address, and ZIP code</div>
            <div class="box-value">${orgName}</div>
            <div style="font-size:9pt">${street || ''}${street && (city || state) ? ', ' : ''}${city || ''}${city && state ? ', ' : ''}${state || ''} ${zip || ''}</div>
          </div>
          <div class="box">
            <div class="box-label">e. Employee's first name and last name</div>
            <div class="box-value">${entry.employeeName}</div>
          </div>
          <div class="box">
            <div class="box-label">Employee's address</div>
            <div class="box-value needs-fill">[FILL IN]</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="grid3">
          <div class="box">
            <div class="box-num">1</div>
            <div class="box-label">Wages, tips, other compensation</div>
            <div class="box-value">${fmtMoney(wages)}</div>
          </div>
          <div class="box">
            <div class="box-num">2</div>
            <div class="box-label">Federal income tax withheld</div>
            <div class="box-value needs-fill">$0.00 [VERIFY]</div>
          </div>
          <div class="box">
            <div class="box-num">3</div>
            <div class="box-label">Social security wages</div>
            <div class="box-value">${fmtMoney(ssWages)}</div>
          </div>
          <div class="box">
            <div class="box-num">4</div>
            <div class="box-label">Social security tax withheld</div>
            <div class="box-value">${fmtMoney(ssWages * 0.062)}</div>
          </div>
          <div class="box">
            <div class="box-num">5</div>
            <div class="box-label">Medicare wages and tips</div>
            <div class="box-value">${fmtMoney(wages)}</div>
          </div>
          <div class="box">
            <div class="box-num">6</div>
            <div class="box-label">Medicare tax withheld</div>
            <div class="box-value">${fmtMoney(wages * 0.0145)}</div>
          </div>
          <div class="box">
            <div class="box-num">7</div>
            <div class="box-label">Social security tips</div>
            <div class="box-value">${fmtMoney(entry.tipAmount)}</div>
          </div>
          <div class="box">
            <div class="box-num">8</div>
            <div class="box-label">Allocated tips</div>
            <div class="box-value">$0.00</div>
          </div>
          <div class="box">
            <div class="box-num">12a</div>
            <div class="box-label">See instructions for box 12</div>
            <div class="box-value">—</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="grid3">
          <div class="box">
            <div class="box-num">15</div>
            <div class="box-label">State / Employer's state ID number</div>
            <div class="box-value">${stateInfo ? stateInfo.name : '<span class="needs-fill">[FILL IN]</span>'}${stateInfo?.noIncomeTax ? ' (no state income tax)' : ''}</div>
          </div>
          <div class="box">
            <div class="box-num">16</div>
            <div class="box-label">State wages, tips, etc.</div>
            <div class="box-value">${stateInfo?.noIncomeTax ? '$0.00' : fmtMoney(wages)}</div>
          </div>
          <div class="box">
            <div class="box-num">17</div>
            <div class="box-label">State income tax</div>
            <div class="box-value needs-fill">$0.00 [VERIFY]</div>
          </div>
          <div class="box">
            <div class="box-num">18</div>
            <div class="box-label">Local wages, tips, etc.</div>
            <div class="box-value">${city ? fmtMoney(wages) : '$0.00'}</div>
          </div>
          <div class="box">
            <div class="box-num">19</div>
            <div class="box-label">Local income tax</div>
            <div class="box-value needs-fill">$0.00 [VERIFY]</div>
          </div>
          <div class="box">
            <div class="box-num">20</div>
            <div class="box-label">Locality name</div>
            <div class="box-value">${city || '—'}</div>
          </div>
        </div>
      </div>

      <div class="footnote">
        <strong>Rail-computed breakdown:</strong> Wages ${fmtMoney(entry.regularPay + entry.overtimePay)}
        (regular ${fmtMoney(entry.regularPay)}, overtime ${fmtMoney(entry.overtimePay)}) + Tips ${fmtMoney(entry.tipAmount)}
        = Total ${fmtMoney(wages)}. SS wage base for ${year}: ${fmtMoney(ssWageBase(year))}.
        Federal income tax withheld is $0 because Rail does not track withholding — verify with actual payroll records.
        State/local tax withheld marked [VERIFY] — complete with actual withholding amounts.
        Fields marked [FILL IN] must be completed before any official use.
        <br><br>This document was generated by Rail. It is NOT a valid IRS W-2 form. Do not file it with any government agency.
        Always have a licensed tax professional prepare official W-2 forms.
      </div>`;

    openPrint(`W-2 ${year} — ${entry.employeeName}`, body);
  }

  const displayEntries = entries
    ? (selectedEmpId === 'all' ? entries : entries.filter(e => e.employeeId === selectedEmpId))
    : [];

  return (
    <div className="space-y-6">
      {/* Config panel */}
      <div className="rounded-xl border bg-card p-5 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Employer & Period</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Tax Year</Label>
            <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); setEntries(null); }}>
              <SelectTrigger className="h-9">{year}</SelectTrigger>
              <SelectContent>
                {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Employer EIN</Label>
            <Input placeholder="XX-XXXXXXX" value={ein} onChange={e => setEin(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Street Address</Label>
            <Input placeholder="123 Main St" value={street} onChange={e => setStreet(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ZIP Code</Label>
            <Input placeholder="10001" value={zip} onChange={e => setZip(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">State</Label>
            <Select value={state} onValueChange={(v) => setState(v ?? '')}>
              <SelectTrigger className="h-9">
                <span className="truncate text-sm">{state ? US_STATES.find(s => s.code === state)?.name : 'Select state'}</span>
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map(s => <SelectItem key={s.code} value={s.code}>{s.name}{s.noIncomeTax ? ' (no income tax)' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">City / Locality</Label>
            <Input placeholder="New York City" value={city} onChange={e => setCity(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Employee</Label>
            <Select value={selectedEmpId} onValueChange={(v) => setSelectedEmpId(v ?? 'all')}>
              <SelectTrigger className="h-9">
                <span className="truncate text-sm">
                  {selectedEmpId === 'all' ? 'All employees' : employees.find(e => e.id === selectedEmpId)?.name ?? 'Select'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={generate} disabled={loading} className="w-full h-9 gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {loading ? 'Loading…' : 'Generate W-2s'}
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      {entries && displayEntries.length === 0 && (
        <p className="text-center text-muted-foreground py-8 text-sm">No payroll data found for {year}. Import shifts and Z reports for this year first.</p>
      )}

      {displayEntries.length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
            <p className="text-sm font-semibold">{displayEntries.length} W-2{displayEntries.length !== 1 ? 's' : ''} ready — {year}</p>
            {displayEntries.length > 1 && (
              <Button size="sm" variant="outline" onClick={() => displayEntries.forEach(e => setTimeout(() => printW2(e), 100))} className="gap-2 text-xs">
                <Printer className="h-3.5 w-3.5" /> Print All
              </Button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Employee</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Wages + Tips (Box 1)</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">SS Tax (Box 4)</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Medicare (Box 6)</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayEntries.map(entry => {
                const wages = entry.regularPay + entry.overtimePay + entry.tipAmount;
                const ss = Math.min(wages, ssWageBase(year)) * 0.062;
                const med = wages * 0.0145;
                return (
                  <tr key={entry.employeeId}>
                    <td className="px-5 py-3 font-medium">{entry.employeeName}
                      <span className="ml-2 text-xs text-muted-foreground capitalize">{entry.role}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-400 font-semibold">{fmtMoney(wages)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmtMoney(ss)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmtMoney(med)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => printW2(entry)} className="gap-1.5 text-xs h-7">
                        <Printer className="h-3 w-3" /> Print
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
