import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Download, CheckCircle, Clock, DollarSign, Users, AlertTriangle } from 'lucide-react';
import { computePayroll } from '../actions';
import { getCurrentOrg } from '@/lib/org';
import { PayrollReviewClient } from './_components/payroll-review-client';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ startDate?: string; endDate?: string }>;

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

function getWeekBounds() {
  const today = new Date();
  const day   = today.getDay();
  const mon   = new Date(today);
  mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: toDate(mon), end: toDate(sun) };
}

function fmtDateRange(start: string, end: string) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  const sStr = `${months[s.getMonth()]} ${s.getDate()}`;
  const eStr = `${months[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  return `${sStr} – ${eStr}`;
}

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

export const metadata: Metadata = { title: 'Pay Period Review' };

export default async function PayrollReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const params    = await searchParams;
  const { org }   = await getCurrentOrg();
  const defaults  = getWeekBounds();
  const startDate = params.startDate ?? defaults.start;
  const endDate   = params.endDate   ?? defaults.end;

  const entries = await computePayroll(startDate, endDate);

  const totals = entries.reduce(
    (acc, e) => ({
      totalHours:        acc.totalHours        + e.totalHours,
      regularPay:        acc.regularPay        + e.regularPay,
      overtimePay:       acc.overtimePay       + e.overtimePay,
      tips:              acc.tips              + e.tipAmount,
      totalCompensation: acc.totalCompensation + e.totalCompensation,
    }),
    { totalHours: 0, regularPay: 0, overtimePay: 0, tips: 0, totalCompensation: 0 },
  );

  const unconfigured = entries.filter(e => !e.role || e.hourlyRate == null);
  const periodLabel  = fmtDateRange(startDate, endDate);

  return (
    <div className="min-h-screen bg-background">

      {/* ── Sticky header bar ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/app/payroll?tab=payroll&startDate=${startDate}&endDate=${endDate}`}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <div className="h-4 w-px bg-border" />
            <div>
              <span className="text-sm font-semibold">Payroll Review</span>
              <span className="text-xs text-muted-foreground ml-2">{periodLabel}</span>
            </div>
          </div>

          {/* Export button — client handles CSV download */}
          <PayrollReviewClient
            entries={entries}
            startDate={startDate}
            endDate={endDate}
            periodLabel={periodLabel}
            orgName={org.name}
            exportOnly
          />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Period + totals summary ─────────────────────────────────────────── */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Pay Period Review</h1>
          <p className="text-muted-foreground">{periodLabel} · {org.name}</p>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryKpi
            icon={<Users className="h-4 w-4" />}
            label="Employees"
            value={String(entries.length)}
            color="text-primary"
          />
          <SummaryKpi
            icon={<Clock className="h-4 w-4" />}
            label="Total Hours"
            value={totals.totalHours.toFixed(1)}
            color="text-sky-600"
          />
          <SummaryKpi
            icon={<DollarSign className="h-4 w-4" />}
            label="Wages"
            value={fmtMoney(totals.regularPay + totals.overtimePay)}
            color="text-amber-600"
          />
          <SummaryKpi
            icon={<DollarSign className="h-4 w-4" />}
            label="Total Payroll"
            value={fmtMoney(totals.totalCompensation)}
            color="text-emerald-600"
            highlight
          />
        </div>

        {/* Unconfigured employees warning */}
        {unconfigured.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-800">
                {unconfigured.length} employee{unconfigured.length > 1 ? 's are' : ' is'} missing a role or hourly rate.
              </p>
              <p className="text-amber-700 text-xs mt-0.5">
                Their pay may be calculated at $0/hr.{' '}
                <Link href="/app/payroll?tab=employees" className="underline">Configure in Employees tab →</Link>
              </p>
            </div>
          </div>
        )}

        {/* ── Employee cards ─────────────────────────────────────────────────── */}
        {entries.length === 0 ? (
          <div className="rounded-xl border bg-card py-16 text-center space-y-2">
            <p className="text-sm font-medium">No payroll data for this period</p>
            <p className="text-xs text-muted-foreground">
              Import employee shifts in{' '}
              <Link href="/app/settings?tab=import-data" className="text-primary hover:underline">
                Settings → Import Data
              </Link>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
                Employee Breakdown
              </h2>
              <span className="text-xs text-muted-foreground">{entries.length} employees</span>
            </div>

            {entries.map((entry) => {
              const wages = entry.regularPay + entry.overtimePay;
              const isConfigured = entry.role && entry.hourlyRate != null;

              return (
                <div
                  key={entry.employeeId}
                  className="rounded-xl border bg-card overflow-hidden"
                >
                  {/* Employee header row */}
                  <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                        {entry.employeeName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{entry.employeeName}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {entry.role ?? '—'}{entry.hourlyRate != null ? ` · $${entry.hourlyRate.toFixed(2)}/hr` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold tabular-nums">{fmtMoney(entry.totalCompensation)}</p>
                      <p className="text-[10px] text-muted-foreground">total</p>
                    </div>
                  </div>

                  {/* Breakdown columns */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0">
                    <PayCell
                      label="Regular"
                      sub={`${entry.regularHours.toFixed(1)} hrs`}
                      value={fmtMoney(entry.regularPay)}
                    />
                    <PayCell
                      label="Overtime"
                      sub={entry.overtimeHours > 0 ? `${entry.overtimeHours.toFixed(1)} hrs` : '—'}
                      value={entry.overtimePay > 0 ? fmtMoney(entry.overtimePay) : '—'}
                      dim={entry.overtimePay === 0}
                    />
                    <PayCell
                      label="Tips"
                      sub={entry.tipAmount > 0 ? 'distributed' : '—'}
                      value={entry.tipAmount > 0 ? fmtMoney(entry.tipAmount) : '—'}
                      dim={entry.tipAmount === 0}
                    />
                    <PayCell
                      label="Wages"
                      sub={`${entry.totalHours.toFixed(1)} total hrs`}
                      value={fmtMoney(wages)}
                      highlight
                    />
                  </div>

                  {!isConfigured && (
                    <div className="px-5 py-2 bg-amber-50 border-t border-amber-200">
                      <p className="text-[11px] text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Missing role or hourly rate — pay may be $0
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Action buttons ─────────────────────────────────────────────────── */}
        {entries.length > 0 && (
          <PayrollReviewClient
            entries={entries}
            startDate={startDate}
            endDate={endDate}
            periodLabel={periodLabel}
            orgName={org.name}
          />
        )}

        {/* ── Totals footer ──────────────────────────────────────────────────── */}
        {entries.length > 0 && (
          <div className="rounded-xl border bg-card px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Period Total</h3>
              <span className="text-xl font-bold tabular-nums text-emerald-600">
                {fmtMoney(totals.totalCompensation)}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">Regular pay</p>
                <p className="font-semibold tabular-nums">{fmtMoney(totals.regularPay)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Overtime pay</p>
                <p className="font-semibold tabular-nums">{fmtMoney(totals.overtimePay)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tips distributed</p>
                <p className="font-semibold tabular-nums">{fmtMoney(totals.tips)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total hours</p>
                <p className="font-semibold tabular-nums">{totals.totalHours.toFixed(1)} hrs</p>
              </div>
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-xs text-center text-muted-foreground px-4">
          Rail calculates payroll for review purposes only. Actual payment processing must be
          handled by your bank, payroll provider, or accountant. Rail does not initiate or guarantee
          any payments.
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryKpi({
  icon, label, value, color, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'bg-emerald-50 border-emerald-200' : 'bg-card'}`}>
      <div className={`mb-2 ${color}`}>{icon}</div>
      <p className={`text-xl font-bold tabular-nums ${highlight ? 'text-emerald-700' : ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function PayCell({
  label, sub, value, dim, highlight,
}: {
  label: string;
  sub: string;
  value: string;
  dim?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`px-4 py-3 space-y-0.5 ${highlight ? 'bg-muted/30' : ''}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${dim ? 'text-muted-foreground' : ''} ${highlight ? 'text-primary' : ''}`}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}
