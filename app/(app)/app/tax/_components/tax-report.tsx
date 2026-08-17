'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { BarChart2, Printer, Loader2, TrendingUp, CircleDollarSign, Users, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getTaxReportData } from '../actions';
import { US_STATES, fmtMoney, openPrint, DISCLAIMER_HTML } from './shared';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import type { TaxReportData } from '../actions';

export default function TaxReport({ orgName }: { orgName: string }) {
  const [startDate, setStartDate]       = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate]           = useState(new Date().toISOString().split('T')[0]);
  const [state, setState]               = useState('');
  const [salesTaxRate, setSalesTaxRate] = useState('');   // % as string, e.g. "8.875"
  const [taxInclusive, setTaxInclusive] = useState(false); // are Z report sales already tax-inclusive?
  const [data, setData]                 = useState<TaxReportData | null>(null);
  const [loading, setLoading]           = useState(false);

  // When a state is chosen, auto-fill the reference state rate (user can override)
  function handleStateChange(code: string) {
    setState(code);
    const stateInfo = US_STATES.find(s => s.code === code);
    if (stateInfo) {
      setSalesTaxRate(stateInfo.salesTaxRate > 0 ? (stateInfo.salesTaxRate * 100).toFixed(3).replace(/\.?0+$/, '') : '0');
    }
  }

  const rateDecimal   = parseFloat(salesTaxRate) / 100 || 0;
  const taxableSales  = taxInclusive && rateDecimal > 0
    ? (data?.totalSales ?? 0) / (1 + rateDecimal)   // back-calculate pre-tax sales
    : (data?.totalSales ?? 0);
  const salesTaxOwed  = taxableSales * rateDecimal;

  async function generate() {
    if (!startDate || !endDate) { toast.error('Select a date range'); return; }
    if (startDate > endDate)    { toast.error('Start date must be before end date'); return; }
    setLoading(true);
    try {
      const result = await getTaxReportData(startDate, endDate);
      setData(result);
      if (result.totalSales === 0 && result.totalWages === 0) toast.error('No data found for this range');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }

  function printReport() {
    if (!data) return;
    const stateInfo  = US_STATES.find(s => s.code === state);
    const totalLabor = data.totalWages + data.employerFICA + data.futatEstimate;
    const grossProfit = data.totalSales + data.totalTips - totalLabor - salesTaxOwed;

    const quartersHtml = data.quarterlyBreakdown.map(q => {
      const qTaxable = taxInclusive && rateDecimal > 0 ? q.sales / (1 + rateDecimal) : q.sales;
      const qTax = qTaxable * rateDecimal;
      return `
        <tr>
          <td>${q.label}</td>
          <td style="text-align:right">${fmtMoney(q.sales)}</td>
          <td style="text-align:right">${fmtMoney(q.tips)}</td>
          ${rateDecimal > 0 ? `<td style="text-align:right">${fmtMoney(qTaxable)}</td><td style="text-align:right">${fmtMoney(qTax)}</td>` : ''}
          <td style="text-align:right">${fmtMoney(q.wages)}</td>
          <td style="text-align:right">${fmtMoney(q.employerFICA)}</td>
        </tr>`;
    }).join('');

    const empHtml = data.employeeSummaries.map(e => `
      <tr>
        <td>${e.name}</td>
        <td style="text-align:right">${fmtMoney(e.totalWages)}</td>
        <td style="text-align:right">${fmtMoney(e.totalTips)}</td>
        <td style="text-align:right">${fmtMoney(e.ssWages)}</td>
        <td style="text-align:right">${fmtMoney(e.ssTaxEmployee)}</td>
        <td style="text-align:right">${fmtMoney(e.medicareTaxEmployee)}</td>
        <td style="text-align:right">${fmtMoney(e.employerFICA)}</td>
      </tr>`).join('');

    const qHeaders = rateDecimal > 0
      ? '<th>Quarter</th><th style="text-align:right">Gross Sales</th><th style="text-align:right">Tips</th><th style="text-align:right">Taxable Sales</th><th style="text-align:right">Sales Tax</th><th style="text-align:right">Est. Wages</th><th style="text-align:right">Employer FICA</th>'
      : '<th>Quarter</th><th style="text-align:right">Sales</th><th style="text-align:right">Tips</th><th style="text-align:right">Est. Wages</th><th style="text-align:right">Employer FICA</th>';

    const body = `
      ${DISCLAIMER_HTML}
      <h1>${orgName}</h1>
      <p class="subtitle">Tax &amp; Payroll Summary Report · ${data.startDate} to ${data.endDate}${stateInfo ? ' · ' + stateInfo.name : ''}</p>

      <div class="section">
        <h2>Revenue</h2>
        <div class="row"><span class="row-label">Gross Sales (from Z reports)</span><span class="row-value">${fmtMoney(data.totalSales)}</span></div>
        <div class="row"><span class="row-label">Tips Collected</span><span class="row-value">${fmtMoney(data.totalTips)}</span></div>
        <div class="row total-row"><span>Total Revenue</span><span>${fmtMoney(data.totalSales + data.totalTips)}</span></div>
      </div>

      ${rateDecimal > 0 ? `
      <div class="section">
        <h2>Sales Tax</h2>
        <div class="row"><span class="row-label">Applied Rate</span><span class="row-value">${(rateDecimal * 100).toFixed(3)}%${stateInfo ? ' (' + stateInfo.name + ' base rate)' : ''}</span></div>
        <div class="row"><span class="row-label">Sales figures are</span><span class="row-value">${taxInclusive ? 'tax-inclusive (backed out above)' : 'pre-tax (tax is additional)'}</span></div>
        <div class="row"><span class="row-label">Taxable Sales</span><span class="row-value">${fmtMoney(taxableSales)}</span></div>
        <div class="row total-row" style="color:#c44"><span>Estimated Sales Tax Collected (remit to state)</span><span>${fmtMoney(salesTaxOwed)}</span></div>
        ${stateInfo?.salesTaxRate && stateInfo.salesTaxRate < rateDecimal
          ? `<p style="font-size:8pt;color:#666;margin-top:4px">Includes local/county add-on above ${stateInfo.name} base rate of ${(stateInfo.salesTaxRate * 100).toFixed(2)}%.</p>`
          : ''}
        <p style="font-size:8pt;color:#666;margin-top:4px">
          ⚠ Sales tax is collected from customers and must be remitted to your state tax authority on the required schedule (monthly/quarterly).
          This estimate is based solely on your Z report sales figures — verify with your actual POS sales tax reports.
        </p>
      </div>` : ''}

      <div class="section">
        <h2>Payroll</h2>
        <div class="row"><span class="row-label">Regular Wages</span><span class="row-value">${fmtMoney(data.totalRegularPay)}</span></div>
        <div class="row"><span class="row-label">Overtime Pay</span><span class="row-value">${fmtMoney(data.totalOvertimePay)}</span></div>
        <div class="row"><span class="row-label">Total Tips Distributed</span><span class="row-value">${fmtMoney(data.totalTipsPaid)}</span></div>
        <div class="row"><span class="row-label">Employer FICA (6.2% SS + 1.45% Medicare)</span><span class="row-value">${fmtMoney(data.employerFICA)}</span></div>
        <div class="row"><span class="row-label">FUTA Estimate (0.6% × $7k/emp)</span><span class="row-value">${fmtMoney(data.futatEstimate)}</span></div>
        <div class="row total-row"><span>Total Labor Cost</span><span>${fmtMoney(totalLabor)}</span></div>
      </div>

      <div class="section">
        <h2>Summary</h2>
        ${rateDecimal > 0 ? `<div class="row"><span class="row-label">Sales Tax Owed to State</span><span class="row-value" style="color:#c44">${fmtMoney(salesTaxOwed)}</span></div>` : ''}
        <div class="row"><span class="row-label">Est. Gross Profit (Revenue − Labor${rateDecimal > 0 ? ' − Sales Tax' : ''})</span><span class="row-value">${fmtMoney(grossProfit)}</span></div>
        <div class="row"><span class="row-label">Employees on Payroll</span><span class="row-value">${data.employeeCount}</span></div>
        <div class="row"><span class="row-label">W-2 Forms Required</span><span class="row-value">${data.employeeCount} (all paid employees)</span></div>
        ${stateInfo ? `<div class="row"><span class="row-label">State Income Tax</span><span class="row-value">${stateInfo.noIncomeTax ? 'None (' + stateInfo.name + ' has no state income tax)' : 'Applicable — consult tax professional for ' + stateInfo.name}</span></div>` : ''}
      </div>

      ${data.quarterlyBreakdown.length > 1 ? `
      <div class="section">
        <h2>Quarterly Breakdown</h2>
        <table>
          <thead><tr>${qHeaders}</tr></thead>
          <tbody>${quartersHtml}</tbody>
        </table>
      </div>` : ''}

      ${data.employeeSummaries.length > 0 ? `
      <div class="section">
        <h2>Per-Employee Wage Summary</h2>
        <table>
          <thead><tr><th>Name</th><th style="text-align:right">Wages</th><th style="text-align:right">Tips</th><th style="text-align:right">SS Wages</th><th style="text-align:right">Emp SS Tax</th><th style="text-align:right">Emp Medicare</th><th style="text-align:right">Emplr FICA</th></tr></thead>
          <tbody>${empHtml}</tbody>
        </table>
      </div>` : ''}

      <div class="footnote">
        <strong>Notes &amp; Assumptions:</strong><br>
        ${rateDecimal > 0 ? `• Sales tax rate ${(rateDecimal * 100).toFixed(3)}% applied to ${taxInclusive ? 'tax-backed-out' : 'gross'} Z report sales. This is the state base rate${stateInfo ? ' for ' + stateInfo.name : ''} — add your county/city rate. Some states exempt alcohol from sales tax or apply a different rate; verify locally.<br>` : '• No sales tax rate entered — sales tax not calculated.<br>'}
        • Employer FICA = 6.2% Social Security (on first $168,600) + 1.45% Medicare per employee.<br>
        • FUTA estimate uses effective rate of 0.6% on first $7,000 per employee after state credit.<br>
        • Tips distributed are treated as wages for FICA purposes.<br>
        • Federal income tax withheld, COGS, rent, and other costs are not tracked by Rail.<br>
        • This report was generated by Rail. It is NOT a substitute for professional accounting or tax advice.
      </div>`;

    openPrint(`Tax Report ${data.startDate} to ${data.endDate} — ${orgName}`, body);
  }

  return (
    <div className="space-y-6">
      {/* Config */}
      <div className="rounded-xl border bg-card p-5 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Report Parameters</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Start Date</Label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">End Date</Label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">State</Label>
            <Select value={state} onValueChange={(v) => handleStateChange(v ?? '')}>
              <SelectTrigger className="h-9">
                <span className="truncate text-sm">{state ? US_STATES.find(s => s.code === state)?.name : 'Select state'}</span>
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map(s => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.name}{s.salesTaxRate === 0 ? ' (no sales tax)' : ` (${(s.salesTaxRate * 100).toFixed(2)}%)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              Combined Sales Tax Rate %
              {state && (
                <span className="text-muted-foreground ml-1 font-normal">
                  (state base: {((US_STATES.find(s => s.code === state)?.salesTaxRate ?? 0) * 100).toFixed(2)}%)
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                type="number" min={0} max={25} step="0.001"
                placeholder="e.g. 8.875"
                value={salesTaxRate}
                onChange={e => setSalesTaxRate(e.target.value)}
                className="h-9 pr-7"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
          </div>
        </div>

        {/* Tax-inclusive toggle + generate */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={taxInclusive}
              onChange={e => setTaxInclusive(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-muted-foreground">
              Z report sales are <strong>tax-inclusive</strong> (sales tax already embedded in the total)
            </span>
          </label>
          <div className="flex items-center gap-2">
            <Button onClick={generate} disabled={loading} className="h-9 gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart2 className="h-4 w-4" />}
              {loading ? 'Generating…' : 'Generate Report'}
            </Button>
            {data && (
              <Button onClick={printReport} variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Print / Save as PDF">
                <Printer className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Quick presets */}
      <div className="flex flex-wrap gap-2">
        {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
          <button key={y} onClick={() => { setStartDate(`${y}-01-01`); setEndDate(`${y}-12-31`); }}
            className="px-3 py-1 rounded-full border text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors">
            Full Year {y}
          </button>
        ))}
        {['Q1','Q2','Q3','Q4'].map((q, i) => {
          const y = new Date().getFullYear();
          const s = [`${y}-01-01`,`${y}-04-01`,`${y}-07-01`,`${y}-10-01`][i];
          const e = [`${y}-03-31`,`${y}-06-30`,`${y}-09-30`,`${y}-12-31`][i];
          return (
            <button key={q} onClick={() => { setStartDate(s); setEndDate(e); }}
              className="px-3 py-1 rounded-full border text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors">
              {q} {y}
            </button>
          );
        })}
      </div>

      {/* Preview cards */}
      {data && (data.totalSales > 0 || data.totalWages > 0) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-l-4 border-l-emerald-600 dark:border-l-emerald-400 bg-card px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Revenue</span>
              <TrendingUp className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
            </div>
            <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{fmtMoney(data.totalSales + data.totalTips)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{fmtMoney(data.totalSales)} sales + {fmtMoney(data.totalTips)} tips</p>
          </div>

          {rateDecimal > 0 && (
            <div className="rounded-xl border border-l-4 border-l-amber-600 dark:border-l-amber-400 bg-card px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sales Tax Owed</span>
                <Receipt className="h-4 w-4 text-amber-700 dark:text-amber-300" />
              </div>
              <p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{fmtMoney(salesTaxOwed)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(rateDecimal * 100).toFixed(3)}% on {fmtMoney(taxableSales)} taxable sales
                {taxInclusive ? ' (backed out of inclusive total)' : ''}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-l-4 border-l-cyan-600 dark:border-l-cyan-400 bg-card px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Labor Cost</span>
              <CircleDollarSign className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
            </div>
            <p className="text-2xl font-bold tabular-nums">{fmtMoney(data.totalWages + data.employerFICA + data.futatEstimate)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">wages + employer FICA + FUTA</p>
          </div>

          <div className="rounded-xl border border-l-4 border-l-violet-600 dark:border-l-violet-400 bg-card px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Employer FICA</span>
              <Users className="h-4 w-4 text-violet-700 dark:text-violet-300" />
            </div>
            <p className="text-2xl font-bold tabular-nums">{fmtMoney(data.employerFICA)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{data.employeeCount} employees · FUTA ~{fmtMoney(data.futatEstimate)}</p>
          </div>
        </div>
      )}

      {/* Sales tax note */}
      {rateDecimal > 0 && data && salesTaxOwed > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 text-xs text-amber-300/80 leading-relaxed">
          <span className="font-semibold text-amber-300">Sales Tax Reminder:</span>{' '}
          The estimated <strong>{fmtMoney(salesTaxOwed)}</strong> in sales tax was collected from your customers and must be remitted to{' '}
          {state ? US_STATES.find(s => s.code === state)?.name ?? 'your state' : 'your state'} on your required filing schedule.
          This is not bar income — it is a pass-through liability. Verify the exact amount against your POS sales tax reports before filing.
        </div>
      )}
    </div>
  );
}
