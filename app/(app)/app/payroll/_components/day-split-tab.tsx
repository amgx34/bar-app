'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getDaySplitData, computePayroll, DaySplitData, DaySplitEmployee } from '../actions';
import { defaultPeriod, monthRange, type PayrollView } from '@/lib/date-range';
import { PeriodToggle } from './period-toggle';
import { openerBonus, type OpenerBonusConfig } from '@/lib/payroll/adjustments';
import { splitBarbackTips, type BarbackSplitMethod, type BarbackTier } from '@/lib/payroll/tip-pool';
import { CashTipsButton } from './cash-tips-card';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalDateStr(d: Date) {
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return toLocalDateStr(dt);
}

function fmtDate(iso: string) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(iso + 'T00:00:00');
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ── Toggle (sliding switch) ────────────────────────────────────────────────────

function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      // role=switch + aria-checked is what makes this read as a control with a
      // state rather than an unnamed button.
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${
        on ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
        on ? 'translate-x-[18px]' : 'translate-x-[3px]'
      }`} />
    </button>
  );
}

// ── Tip calculation ────────────────────────────────────────────────────────────

interface RowState {
  active: boolean;
  opener: boolean;
}

function computeSplit(
  employees: DaySplitEmployee[],
  states: Record<string, RowState>,
  totalTips: number,
  bonusConfig: OpenerBonusConfig,
  barbackFraction: number,
  barbackSplitMethod: BarbackSplitMethod,
  barbackTiers: BarbackTier[],
) {
  // Membership comes from tipRole, decided server-side by the same function the
  // pay run uses. Filtering on `role !== 'barback'` here is what used to put
  // managers, security and Not Tipped staff into the bartender pool.
  const active = employees.filter(
    (e) => e.tipRole !== 'none' && states[e.id]?.active !== false,
  );

  const bartenders = active.filter((e) => e.tipRole === 'pool');
  const barbacks   = active.filter((e) => e.tipRole === 'barback');
  const openers    = bartenders.filter((e) => states[e.id]?.opener);

  // Only taken when somebody is actually barbacking, and only for the barbacks
  // who are on a percentage deal — the same function the pay run uses, so a
  // barback moved to hourly shows the identical figure on both screens.
  const barbackSplit = splitBarbackTips({
    dailyTips: totalTips,
    barbackFraction,
    method: barbackSplitMethod,
    tiers: barbackTiers,
    barbackShifts: barbacks.map((e) => ({ employeeId: e.id, payType: e.payType, hours: e.hours })),
  });

  // What the bartenders share before the opener's cut. The pay run funds the
  // bonus from this same figure, so basing the preview on total tips instead
  // is what made the two screens disagree.
  const poolTips = Math.max(0, barbackSplit.poolTips);
  const barbackPool = totalTips - poolTips;

  const bonus = openers.length > 0
    ? openerBonus(bonusConfig, poolTips)
    : { bonusTips: 0, bonusHours: 0, fundedFromPool: 0 };

  // Zero for the `hours` type, which the bar pays as wages rather than taking
  // out of the other bartenders' tips.
  const openerPool    = bonus.fundedFromPool;
  const bartenderPool = Math.max(0, poolTips - openerPool);

  const totalBartenderHours = bartenders.reduce((s, e) => s + e.hours, 0);

  const shares: Record<string, number> = {};

  for (const emp of bartenders) {
    const hourShare = totalBartenderHours > 0 ? emp.hours / totalBartenderHours : 0;
    const base = hourShare * bartenderPool;
    // Split between openers when more than one is marked, so two people
    // sharing an open do not each collect the whole bonus.
    const extra = states[emp.id]?.opener && openers.length > 0
      ? openerPool / openers.length
      : 0;
    shares[emp.id] = base + extra;
  }

  for (const emp of barbacks) {
    // Absent from the map means an hourly barback, who draws nothing here.
    shares[emp.id] = barbackSplit.tipsByEmployee.get(emp.id) ?? 0;
  }

  return {
    shares,
    bartenderPool,
    barbackPool,
    openerPool,
    hasOpener: openers.length > 0,
    /** Extra paid hours each opener earns. Non-zero only for the `hours` type. */
    bonusHoursEach: bonus.bonusHours,
    bonusType: bonusConfig.type,
    bonusValue: bonusConfig.value,
    // The cut the tier actually chose, so the headings can say WHICH rule ran
    // tonight rather than quoting the flat slider a tiered bar no longer uses.
    appliedFraction: barbackSplit.appliedFraction,
    barbackCount: barbackSplit.barbackCount,
  };
}

/** How the configured bonus reads on screen, in the operator's words. */
function describeBonus(type: OpenerBonusConfig['type'], value: number): string {
  if (type === 'none' || !(value > 0)) return 'No opener bonus set';
  if (type === 'fixed')      return `$${value.toFixed(2)} off the bartender pool`;
  if (type === 'percentage') return `${value}% of the bartender pool`;
  return `${value} extra paid hours — paid by the bar, not from tips`;
}

// ── What this night cost in wages ──────────────────────────────────────────────

interface NightPay {
  hours: number;
  wages: number;
  tips: number;
  total: number;
}

/**
 * Totals one night's pay run.
 *
 * `computePayroll` over a single date is the SAME engine the week and month
 * views run, so these figures cannot drift from the pay run the way a second
 * hand-rolled calculation would.
 *
 * One thing it cannot tell you: overtime. The engine buckets hours per calendar
 * week (`splitWeeklyOvertime`), so a night computed on its own never crosses the
 * 40-hour line and never earns a premium — even when the week around it does.
 * `wages` is therefore what these hours are worth at base rate, and the strip
 * says so rather than calling it total pay.
 */
function sumNightPay(entries: { totalHours: number; regularPay: number; overtimePay: number; tipAmount: number }[]): NightPay {
  return entries.reduce<NightPay>(
    (acc, e) => ({
      hours: acc.hours + e.totalHours,
      wages: acc.wages + e.regularPay + e.overtimePay,
      tips: acc.tips + e.tipAmount,
      total: acc.total + e.regularPay + e.overtimePay + e.tipAmount,
    }),
    { hours: 0, wages: 0, tips: 0, total: 0 },
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DaySplitTab({
  canEdit = false,
  initialDate,
}: {
  canEdit?: boolean;
  /** The night a `?date=` link named, so a shared URL opens on that night. */
  initialDate?: string;
}) {
  const [date, setDate] = useState(initialDate ?? toLocalDateStr(new Date()));
  const [states, setStates] = useState<Record<string, RowState>>({});
  // Bumped after cash tips are logged, so the split below re-reads the total it
  // is derived from rather than showing a figure that is now stale.
  const [refresh, setRefresh] = useState(0);

  // Carries the date it was loaded for, so "loading" and "no data" are derived
  // rather than set synchronously in the effect body — three setState calls
  // before the fetch even started was three extra renders on every date change.
  const [result, setResult] = useState<{ date: string; data: DaySplitData | null } | null>(null);
  // Same shape, same reason: carrying the date means a stale response for the
  // night you just navigated away from cannot paint over the current one.
  const [pay, setPay] = useState<{ date: string; data: NightPay | null } | null>(null);

  useEffect(() => {
    let cancelled = false;

    // In parallel. The pay figures are a strip above the split, not something
    // the split waits on, and serialising them would double the time the whole
    // screen sits empty on every arrow press.
    getDaySplitData(date).then((d) => {
      if (cancelled) return;
      setResult({ date, data: d });
      if (!d) return;
      // Default states: active for all, opener off for all
      const init: Record<string, RowState> = {};
      d.employees.forEach((e) => {
        init[e.id] = { active: true, opener: false };
      });
      setStates(init);
    });

    computePayroll(date, date)
      .then((entries) => {
        if (!cancelled) setPay({ date, data: sumNightPay(entries) });
      })
      // A failed pay run must not take the tip split down with it: the split is
      // what this screen is for, and it needs none of these numbers.
      .catch(() => { if (!cancelled) setPay({ date, data: null }); });

    return () => { cancelled = true; };
  }, [date, refresh]);

  const loading = result?.date !== date;
  const data    = loading ? null : result?.data ?? null;
  const noData  = !loading && data === null;

  // Independent of the split above: the two requests land separately, and the
  // strip should appear as soon as its own answer does.
  const nightPay = pay?.date === date ? pay.data : null;

  // Where Week and Month go from here. Built from the night on screen rather
  // than from today, so switching period keeps you near the night you were
  // looking at instead of snapping to the current week.
  const hrefs = useMemo(() => {
    const week  = defaultPeriod('week', date);
    const month = monthRange(date);
    return {
      day:   `/app/payroll?view=day&date=${date}`,
      week:  `/app/payroll?view=week&startDate=${week.start}&endDate=${week.end}`,
      month: `/app/payroll?view=month&startDate=${month.start}&endDate=${month.end}`,
    } satisfies Record<PayrollView, string>;
  }, [date]);

  const toggleActive = (id: string) =>
    setStates((s) => ({ ...s, [id]: { ...s[id], active: !s[id]?.active } }));

  const toggleOpener = (id: string) =>
    setStates((s) => ({ ...s, [id]: { ...s[id], opener: !s[id]?.opener } }));

  const {
    shares, bartenderPool, barbackPool, openerPool,
    hasOpener, bonusHoursEach, bonusType, bonusValue,
    appliedFraction, barbackCount,
  } = useMemo(() => {
    if (!data) {
      return {
        shares: {} as Record<string, number>,
        bartenderPool: 0, barbackPool: 0, openerPool: 0,
        hasOpener: false, bonusHoursEach: 0,
        bonusType: 'none' as OpenerBonusConfig['type'], bonusValue: 0,
        appliedFraction: 0, barbackCount: 0,
      };
    }
    return computeSplit(
      data.employees, states, data.totalTips, data.openerBonus, data.barbackFraction,
      data.barbackSplitMethod, data.barbackTiers,
    );
  }, [data, states]);

  const pctOfTips = (n: number) =>
    data && data.totalTips > 0 ? `${((n / data.totalTips) * 100).toFixed(0)}% of tips` : '—';

  const bartenders = (data?.employees ?? []).filter((e) => e.tipRole === 'pool');
  const barbacks   = (data?.employees ?? []).filter((e) => e.tipRole === 'barback');
  // Shown, not hidden. Somebody who worked but is not in the split needs to see
  // why, or the calculator just looks like it lost them.
  const notInPool  = (data?.employees ?? []).filter((e) => e.tipRole === 'none');

  return (
    <div className="space-y-6">
      {/* Period switcher. Its own row rather than sharing the date nav's: the
          date nav already runs to four controls, and on a phone a fifth pushed
          the cash-tips button onto a line of its own anyway. */}
      <PeriodToggle view="day" hrefs={hrefs} />

      {/* Date nav */}
      <div className="flex flex-wrap items-center gap-3">
        <button aria-label="Previous day" onClick={() => setDate(addDays(date, -1))} className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium min-w-[180px] text-center sm:min-w-[220px]">{fmtDate(date)}</span>
        <button aria-label="Next day" onClick={() => setDate(addDays(date, 1))} className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="ml-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />

        {/* Sits on the date row rather than in a block above the numbers: it is
            a once-a-night action, and the figures below are what this screen is
            for. The button still carries the amount, so nothing is hidden. */}
        <div className="ml-auto">
          <CashTipsButton
            date={date}
            canEdit={canEdit}
            onSaved={() => setRefresh((n) => n + 1)}
          />
        </div>
      </div>

      {/* What the night cost. Sits above the tip split because it answers the
          other question an operator has at close — the split says who gets
          what, this says what the night is worth in total. */}
      {nightPay && nightPay.hours > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Hours</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{nightPay.hours.toFixed(1)}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Wages</p>
            <p className="text-2xl font-bold tabular-nums mt-1">${nightPay.wages.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Tips</p>
            <p className="text-2xl font-bold tabular-nums mt-1">${nightPay.tips.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border bg-primary/5 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Night Total</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-primary">${nightPay.total.toFixed(2)}</p>
          </div>
          {/* Said plainly rather than left for somebody to discover by adding
              up seven nights and finding they miss the week. */}
          <p className="col-span-2 text-xs text-muted-foreground sm:col-span-4">
            Wages are at base rate — overtime is worked out across the whole week,
            so it shows on the Week and Month views rather than on one night.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {/* No data */}
      {noData && !loading && (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <p className="text-muted-foreground font-medium">No shift data for {fmtDate(date)}</p>
          <p className="text-sm text-muted-foreground mt-1">Import employee shifts and a Z report for this date first.</p>
        </div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Tips</p>
              <p className="text-2xl font-bold tabular-nums mt-1">${data.totalTips.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 border-l-4 border-l-emerald-600 dark:border-l-emerald-400">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Bartender Pool</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-emerald-700 dark:text-emerald-300">${bartenderPool.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{pctOfTips(bartenderPool)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 border-l-4 border-l-cyan-600 dark:border-l-cyan-400">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Barback Pool</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-cyan-700 dark:text-cyan-300">${barbackPool.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                {barbackPool > 0
                  ? `${(appliedFraction * 100).toFixed(0)}% of tips`
                  : 'no barback on shift'}
              </p>
            </div>
            <div className={`rounded-xl border bg-card p-4 border-l-4 ${hasOpener ? 'border-l-amber-600 dark:border-l-amber-400' : 'border-l-muted'}`}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Opener Bonus</p>
              {/* Hours are shown as hours, not dollars. The bar pays them at the
                  opener's own rate, which this screen does not know — printing a
                  dollar figure here would be a guess presented as a fact. */}
              <p className={`text-2xl font-bold tabular-nums mt-1 ${hasOpener && (openerPool > 0 || bonusHoursEach > 0) ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
                {bonusType === 'hours'
                  ? (hasOpener ? `+${bonusHoursEach} hrs` : '—')
                  : `$${openerPool.toFixed(2)}`}
              </p>
              <p className="text-xs text-muted-foreground">{describeBonus(bonusType, bonusValue)}</p>
            </div>
          </div>

          {/* Bartenders table */}
          {bartenders.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Bartenders — {pctOfTips(bartenderPool)}, shared by hours
              </h3>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-3 sm:px-4 text-left font-medium">Name</th>
                      <th className="px-3 py-3 sm:px-4 text-right font-medium">Hours</th>
                      <th className="px-3 py-3 sm:px-4 text-center font-medium">Opener</th>
                      <th className="px-3 py-3 sm:px-4 text-right font-medium">Tip Share</th>
                      <th className="px-3 py-3 sm:px-4 text-center font-medium w-12">In</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bartenders.map((emp) => {
                      const active = states[emp.id]?.active !== false;
                      const isOpener = !!states[emp.id]?.opener;
                      return (
                        <tr key={emp.id} className={`border-b last:border-b-0 transition-colors ${!active ? 'opacity-40' : ''}`}>
                          <td className="px-3 py-3 sm:px-4 font-medium">
                            {emp.name}
                            {emp.role && (
                              <span className="ml-2 text-xs text-muted-foreground capitalize">({emp.role})</span>
                            )}
                            {isOpener && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                                {bonusType === 'hours'
                                  ? `Opener +${bonusHoursEach}h`
                                  : bonusType === 'none'
                                    ? 'Opener'
                                    : `Opener +$${(openerPool / Math.max(1, Object.keys(states).filter((k) => states[k]?.opener).length)).toFixed(2)}`}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 sm:px-4 text-right tabular-nums text-muted-foreground">
                            {emp.hours.toFixed(2)}
                          </td>
                          <td className="px-3 py-3 sm:px-4 text-center">
                            <Toggle
                              on={isOpener}
                              label={`Mark ${emp.name} as opener`}
                              onChange={() => active && toggleOpener(emp.id)}
                              disabled={!active}
                            />
                          </td>
                          <td className="px-3 py-3 sm:px-4 text-right tabular-nums font-semibold text-primary">
                            {active ? `$${(shares[emp.id] ?? 0).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-3 py-3 sm:px-4 text-center">
                            <button
                              aria-label={active ? `Remove ${emp.name} from this night` : `Add ${emp.name} to this night`}
                              onClick={() => toggleActive(emp.id)}
                              className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors mx-auto ${
                                active
                                  ? 'hover:bg-destructive/15 hover:text-destructive text-muted-foreground'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
                              }`}
                            >
                              {active ? <X className="h-3.5 w-3.5" /> : <span className="text-xs font-bold">+</span>}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Barbacks table */}
          {barbacks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Barbacks — {(appliedFraction * 100).toFixed(0)}%{' '}
                {data.barbackSplitMethod === 'hours' ? 'split by hours' : 'split equally'}
                {/* Only worth saying when the cut DEPENDS on the headcount —
                    otherwise it reads as a rule that is not actually running. */}
                {data.barbackTiers.length > 0 && (
                  <span className="normal-case font-normal text-muted-foreground/80">
                    {' '}&middot; {barbackCount} {barbackCount === 1 ? 'barback' : 'barbacks'} on tonight
                  </span>
                )}
              </h3>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-3 sm:px-4 text-left font-medium">Name</th>
                      <th className="px-3 py-3 sm:px-4 text-right font-medium">Hours</th>
                      <th className="px-3 py-3 sm:px-4 text-right font-medium">Tip Share</th>
                      <th className="px-3 py-3 sm:px-4 text-center font-medium w-12">In</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barbacks.map((emp) => {
                      const active = states[emp.id]?.active !== false;
                      return (
                        <tr key={emp.id} className={`border-b last:border-b-0 ${!active ? 'opacity-40' : ''}`}>
                          <td className="px-3 py-3 sm:px-4 font-medium">{emp.name}</td>
                          <td className="px-3 py-3 sm:px-4 text-right tabular-nums text-muted-foreground">
                            {emp.hours.toFixed(2)}
                          </td>
                          <td className="px-3 py-3 sm:px-4 text-right tabular-nums font-semibold text-cyan-700 dark:text-cyan-300">
                            {active ? `$${(shares[emp.id] ?? 0).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-3 py-3 sm:px-4 text-center">
                            <button
                              aria-label={active ? `Remove ${emp.name} from this night` : `Add ${emp.name} to this night`}
                              onClick={() => toggleActive(emp.id)}
                              className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors mx-auto ${
                                active
                                  ? 'hover:bg-destructive/15 hover:text-destructive text-muted-foreground'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
                              }`}
                            >
                              {active ? <X className="h-3.5 w-3.5" /> : <span className="text-xs font-bold">+</span>}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Worked the night, but takes no part in the pool.
              Previously these people were counted as bartenders here and paid
              nothing by the pay run, so the preview was diluted and the
              discrepancy was invisible from either screen. */}
          {notInPool.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Not in the tip pool
              </h3>
              <div className="rounded-xl border divide-y">
                {notInPool.map((emp) => (
                  <div
                    key={emp.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm sm:px-4"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{emp.name}</span>
                      {emp.role && (
                        <span className="ml-2 text-xs text-muted-foreground capitalize">
                          ({emp.role})
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {emp.hours.toFixed(2)} hrs
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {emp.excludedReason}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Their hours are still paid — this only affects the nightly tip
                split. Change it under Payroll &rarr; Employees.
              </p>
            </div>
          )}

          {/* The hours bonus is the one type that does not show up in the
              figures on this screen, so it says where it does show up. */}
          {hasOpener && bonusType === 'hours' && bonusHoursEach > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              The opener bonus is set to <strong>{bonusHoursEach} extra paid hours</strong>.
              That is paid by the bar at the opener&rsquo;s own hourly rate, so it does
              not come out of the tips above &mdash; it is added to their hours on the
              pay run. Mark the opener on the Payroll tab for it to be applied.
            </div>
          )}

          {/* No tips warning */}
          {data.totalTips === 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-400">
              No tip data for this date — import a Z report to see tip distributions.
            </div>
          )}
        </>
      )}
    </div>
  );
}
