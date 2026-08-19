'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getDaySplitData, DaySplitData, DaySplitEmployee } from '../actions';
import { CashTipsCard } from './cash-tips-card';

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

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
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
  totalTips: number
) {
  const BARBACK_PCT = 0.15;
  const OPENER_PCT  = 0.05;

  const active = employees.filter((e) => states[e.id]?.active !== false);

  const bartenders = active.filter((e) => e.role !== 'barback');
  const barbacks   = active.filter((e) => e.role === 'barback');
  const openers    = bartenders.filter((e) => states[e.id]?.opener);

  const hasOpener     = openers.length > 0;
  const openerPool    = hasOpener ? totalTips * OPENER_PCT : 0;
  const barbackPool   = totalTips * BARBACK_PCT;
  const bartenderPool = totalTips - barbackPool - openerPool; // remaining after barbacks + opener bonus

  const totalBartenderHours = bartenders.reduce((s, e) => s + e.hours, 0);
  const activeBarbackCount  = barbacks.length;

  const shares: Record<string, number> = {};

  for (const emp of bartenders) {
    const hourShare = totalBartenderHours > 0 ? emp.hours / totalBartenderHours : 0;
    const base = hourShare * bartenderPool;
    const bonus = openers.length > 0 && states[emp.id]?.opener
      ? openerPool / openers.length
      : 0;
    shares[emp.id] = base + bonus;
  }

  for (const emp of barbacks) {
    shares[emp.id] = activeBarbackCount > 0 ? barbackPool / activeBarbackCount : 0;
  }

  return { shares, bartenderPool, barbackPool, openerPool, hasOpener };
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DaySplitTab({ canEdit = false }: { canEdit?: boolean }) {
  const [date, setDate] = useState(toLocalDateStr(new Date()));
  const [data, setData] = useState<DaySplitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [noData, setNoData] = useState(false);
  const [states, setStates] = useState<Record<string, RowState>>({});
  // Bumped after cash tips are logged, so the split below re-reads the total it
  // is derived from rather than showing a figure that is now stale.
  const [refresh, setRefresh] = useState(0);

  // Fetch data whenever date changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNoData(false);
    setData(null);
    getDaySplitData(date).then((d) => {
      if (cancelled) return;
      setLoading(false);
      if (!d) { setNoData(true); return; }
      setData(d);
      // Default states: active for all, opener off for all
      const init: Record<string, RowState> = {};
      d.employees.forEach((e) => {
        init[e.id] = { active: true, opener: false };
      });
      setStates(init);
    });
    return () => { cancelled = true; };
  }, [date, refresh]);

  const toggleActive = (id: string) =>
    setStates((s) => ({ ...s, [id]: { ...s[id], active: !s[id]?.active } }));

  const toggleOpener = (id: string) =>
    setStates((s) => ({ ...s, [id]: { ...s[id], opener: !s[id]?.opener } }));

  const { shares, bartenderPool, barbackPool, openerPool, hasOpener } = useMemo(() => {
    if (!data) return { shares: {}, bartenderPool: 0, barbackPool: 0, openerPool: 0, hasOpener: false };
    return computeSplit(data.employees, states, data.totalTips);
  }, [data, states]);

  const bartenders = (data?.employees ?? []).filter((e) => e.role !== 'barback');
  const barbacks   = (data?.employees ?? []).filter((e) => e.role === 'barback');

  return (
    <div className="space-y-6">
      {/* Date nav */}
      <div className="flex items-center gap-3">
        <button onClick={() => setDate(addDays(date, -1))} className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium min-w-[220px] text-center">{fmtDate(date)}</span>
        <button onClick={() => setDate(addDays(date, 1))} className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="ml-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
      </div>

      <CashTipsCard
        date={date}
        canEdit={canEdit}
        onSaved={() => setRefresh((n) => n + 1)}
      />

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
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Tips</p>
              <p className="text-2xl font-bold tabular-nums mt-1">${data.totalTips.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 border-l-4 border-l-emerald-600 dark:border-l-emerald-400">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Bartender Pool</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-emerald-700 dark:text-emerald-300">${bartenderPool.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{hasOpener ? '80%' : '85%'} of tips</p>
            </div>
            <div className="rounded-xl border bg-card p-4 border-l-4 border-l-cyan-600 dark:border-l-cyan-400">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Barback Pool</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-cyan-700 dark:text-cyan-300">${barbackPool.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">15% of tips</p>
            </div>
            <div className={`rounded-xl border bg-card p-4 border-l-4 ${hasOpener ? 'border-l-amber-600 dark:border-l-amber-400' : 'border-l-muted'}`}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Opener Bonus</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${hasOpener ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
                ${openerPool.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">5% of tips</p>
            </div>
          </div>

          {/* Bartenders table */}
          {bartenders.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Bartenders — {hasOpener ? '80%' : '85%'} by hours
              </h3>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-4 py-3 text-left font-medium">Name</th>
                      <th className="px-4 py-3 text-right font-medium">Hours</th>
                      <th className="px-4 py-3 text-center font-medium">Opener</th>
                      <th className="px-4 py-3 text-right font-medium">Tip Share</th>
                      <th className="px-4 py-3 text-center font-medium w-12">In</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bartenders.map((emp) => {
                      const active = states[emp.id]?.active !== false;
                      const isOpener = !!states[emp.id]?.opener;
                      return (
                        <tr key={emp.id} className={`border-b last:border-b-0 transition-colors ${!active ? 'opacity-40' : ''}`}>
                          <td className="px-4 py-3 font-medium">
                            {emp.name}
                            {emp.role && (
                              <span className="ml-2 text-xs text-muted-foreground capitalize">({emp.role})</span>
                            )}
                            {isOpener && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                                Opener +5%
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {emp.hours.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Toggle
                              on={isOpener}
                              onChange={() => active && toggleOpener(emp.id)}
                              disabled={!active}
                            />
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-primary">
                            {active ? `$${(shares[emp.id] ?? 0).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
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
                Barbacks — 15% split equally
              </h3>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-4 py-3 text-left font-medium">Name</th>
                      <th className="px-4 py-3 text-right font-medium">Hours</th>
                      <th className="px-4 py-3 text-right font-medium">Tip Share</th>
                      <th className="px-4 py-3 text-center font-medium w-12">In</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barbacks.map((emp) => {
                      const active = states[emp.id]?.active !== false;
                      return (
                        <tr key={emp.id} className={`border-b last:border-b-0 ${!active ? 'opacity-40' : ''}`}>
                          <td className="px-4 py-3 font-medium">{emp.name}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {emp.hours.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-cyan-700 dark:text-cyan-300">
                            {active ? `$${(shares[emp.id] ?? 0).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
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
