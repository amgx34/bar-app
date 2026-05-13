import Link from 'next/link';
import dynamicImport from 'next/dynamic';
import {
  Upload, CircleDollarSign, TrendingUp, Calculator,
  Users, Gauge, AlertTriangle, CheckCircle, ArrowUpRight,
  Banknote, BarChart2, Clock, Package,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';

const DashboardRevenueChart = dynamicImport(() => import('./_components/DashBoardRevenueChart'));

export const dynamic = 'force-dynamic';

// helper functions

function toLocalDateStr(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function getWeekStart() {
  const t = new Date();
  const d = t.getDay();
  const m = new Date(t);
  m.setDate(t.getDate() - (d === 0 ? 6 : d - 1));
  return toLocalDateStr(m);
}

function fmtDate(iso: string) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const d = new Date(iso + 'T00:00:00');
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function stdDev(arr: number[]) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const { org } = await getCurrentOrg();
  const supabase = await createClient();
  const orgId = org.id;

  const weekStart = getWeekStart();
  const today = toLocalDateStr(new Date());

  // Parallel data fetching
  const [
    { data: recentNights },
    { data: weekDays },
    { data: allServerTips },
    { data: employees },
    { data: inventoryItems },
  ] = await Promise.all([
    supabase
      .from('z_report_days')
      .select('report_date, total_sales, cash_tips, cc_tips')
      .eq('organization_id', orgId)
      .order('report_date', { ascending: false })
      .limit(7),
    supabase
      .from('z_report_days')
      .select('total_sales, cash_tips, cc_tips')
      .eq('organization_id', orgId)
      .gte('report_date', weekStart)
      .lte('report_date', today),
    supabase
      .from('z_report_server_tips')
      .select('employee_name, total_sales, tips_paid_out')
      .eq('organization_id', orgId),
    supabase
      .from('employees')
      .select('id, name, role, hourly_rate')
      .eq('organization_id', orgId),
    supabase
      .from('inventory_items')
      .select('id, name, unit, current_stock, par_level, rep_id, inventory_categories(name), reps(id, name)')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name'),
  ]);

  // ── Metric calculations ────────────────────────────────────────────────────

  const lastNight = recentNights?.[0] ?? null;
  const lastNightSales = lastNight?.total_sales ?? 0;
  const lastNightTips = ((lastNight?.cash_tips ?? 0) + (lastNight?.cc_tips ?? 0));
  const lastNightTipPct = lastNightSales > 0 ? (lastNightTips / lastNightSales) * 100 : 0;

  const weekSales = (weekDays ?? []).reduce((s, d) => s + (d.total_sales ?? 0), 0);
  const weekTips = (weekDays ?? []).reduce((s, d) => s + (d.cash_tips ?? 0) + (d.cc_tips ?? 0), 0);
  const validWeekDays = (weekDays ?? []).filter((d) => d.total_sales > 0);
  const weekAvgTipPct = validWeekDays.length > 0
    ? validWeekDays.reduce((s, d) => s + (d.cash_tips + d.cc_tips) / d.total_sales, 0) / validWeekDays.length * 100
    : 0;

  // Flagged bartenders (>2σ above mean tip%)
  const serverRows = (allServerTips ?? []).filter((r) => r.total_sales > 0);
  const allTipPcts = serverRows.map((r) => r.tips_paid_out / r.total_sales);
  const popMean = allTipPcts.length > 0 ? allTipPcts.reduce((s, v) => s + v, 0) / allTipPcts.length : 0;
  const popStd = stdDev(allTipPcts);
  const flagThreshold = popMean + 2 * popStd;

  const byServer = new Map<string, number[]>();
  for (const r of serverRows) {
    if (!byServer.has(r.employee_name)) byServer.set(r.employee_name, []);
    byServer.get(r.employee_name)!.push(r.tips_paid_out / r.total_sales);
  }
  const flaggedCount = [...byServer.entries()].filter(
    ([, pcts]) => pcts.reduce((s, v) => s + v, 0) / pcts.length > flagThreshold
  ).length;

  const EXCLUDED = new Set(['front door']);
  const unconfiguredEmployees = (employees ?? []).filter(
    (e) => !EXCLUDED.has(e.name.toLowerCase()) && (!e.role || e.hourly_rate === null)
  );

  const nightsData = (recentNights ?? []).map((d) => ({
    nightDate: d.report_date as string,
    totalSales: d.total_sales as number,
    totalTips: ((d.cash_tips as number) + (d.cc_tips as number)),
    tipPercent: d.total_sales > 0 ? ((d.cash_tips + d.cc_tips) / d.total_sales) * 100 : 0,
  }));

  const maxSales = nightsData.length > 0 ? Math.max(...nightsData.map((n) => n.totalSales)) : 1;

  // Inventory snapshot
  const items = inventoryItems ?? [];
  const lowStockItems = items
    .filter((i) => i.par_level !== null && i.current_stock < i.par_level)
    .sort((a, b) => (a.current_stock / (a.par_level ?? 1)) - (b.current_stock / (b.par_level ?? 1)));

  const categoryMap = new Map<string, { total: number; low: number }>();
  for (const item of items) {
    const cat = (item.inventory_categories as unknown as { name: string } | null)?.name ?? 'Uncategorized';
    if (!categoryMap.has(cat)) categoryMap.set(cat, { total: 0, low: 0 });
    const entry = categoryMap.get(cat)!;
    entry.total++;
    if (item.par_level !== null && item.current_stock < item.par_level) entry.low++;
  }
  const categoryRows = [...categoryMap.entries()].sort((a, b) => b[1].total - a[1].total);

  // Reorder suggestions: low-stock items that have a rep linked
  const autoReorderEnabled = org.bar_settings?.auto_reorder_enabled ?? false;
  const reorderItems = items.filter(
    (i) => i.par_level !== null && i.current_stock < i.par_level && i.rep_id
  );
  const reorderByRep = new Map<string, { rep: { id: string; name: string }; items: typeof reorderItems }>();
  for (const item of reorderItems) {
    const repData = (item.reps as unknown as { id: string; name: string } | null);
    if (!repData) continue;
    if (!reorderByRep.has(repData.id)) reorderByRep.set(repData.id, { rep: repData, items: [] });
    reorderByRep.get(repData.id)!.items.push(item);
  }
  const reorderGroups = [...reorderByRep.values()];

  const hasAlerts = flaggedCount > 0 || unconfiguredEmployees.length > 0 || lowStockItems.length > 0;

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()}</p>
          <h1 className="text-3xl font-bold tracking-tight mt-0.5">{org.name}</h1>
        </div>
        <p className="text-sm text-muted-foreground hidden sm:block">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* ── Alerts strip ──────────────────────────────────────────────────── */}
      {hasAlerts && (
        <div className="flex flex-wrap gap-3">
          {unconfiguredEmployees.length > 0 && (
            <Link href="/app/payroll?tab=employees" className="flex items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2.5 text-sm text-yellow-400 hover:bg-yellow-500/15 transition-colors">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {unconfiguredEmployees.length} employee{unconfiguredEmployees.length > 1 ? 's' : ''} need configuration
              <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          )}
          {flaggedCount > 0 && (
            <Link href="/app/tips?tab=flags" className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/15 transition-colors">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {flaggedCount} bartender{flaggedCount > 1 ? 's' : ''} flagged for unusual tip %
              <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          )}
          {lowStockItems.length > 0 && (
            <Link href="/app/inventory" className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400 hover:bg-amber-500/15 transition-colors">
              <Package className="h-4 w-4 shrink-0" />
              {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} running low on stock
              <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          )}
        </div>
      )}

      {/* ── Key metrics ────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Last night */}
        {lastNight && (
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            Last Night · {fmtDate(lastNight.report_date as string)}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Sales"
            value={`$${lastNightSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<BarChart2 className="h-4 w-4" />}
            accent="emerald"
            empty={!lastNight}
          />
          <StatCard
            label="Tips"
            value={`$${lastNightTips.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<Banknote className="h-4 w-4" />}
            accent="cyan"
            empty={!lastNight}
          />
          <StatCard
            label="Tip %"
            value={`${lastNightTipPct.toFixed(1)}%`}
            icon={<TrendingUp className="h-4 w-4" />}
            accent="primary"
            empty={!lastNight}
          />
        </div>

        {/* This week */}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest pt-2">
          This Week
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Week Sales"
            value={`$${weekSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<BarChart2 className="h-4 w-4" />}
            accent="emerald"
            muted
            empty={weekDays?.length === 0}
          />
          <StatCard
            label="Week Tips"
            value={`$${weekTips.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<Banknote className="h-4 w-4" />}
            accent="cyan"
            muted
            empty={weekDays?.length === 0}
          />
          <StatCard
            label="Avg Tip %"
            value={`${weekAvgTipPct.toFixed(1)}%`}
            icon={<TrendingUp className="h-4 w-4" />}
            accent="primary"
            muted
            empty={weekDays?.length === 0}
          />
        </div>
      </div>

      {/* ── Quick access ───────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Quick Access</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <QuickLink href="/app/payroll?tab=import" icon={<Upload className="h-5 w-5" />} label="Import Data" color="text-primary bg-primary/10" />
          <QuickLink href="/app/payroll" icon={<CircleDollarSign className="h-5 w-5" />} label="Payroll" color="text-emerald-400 bg-emerald-400/10" />
          <QuickLink href="/app/payroll?tab=split" icon={<Calculator className="h-5 w-5" />} label="Day Split" color="text-amber-400 bg-amber-400/10" />
          <QuickLink href="/app/tips" icon={<TrendingUp className="h-5 w-5" />} label="Tip Analytics" color="text-cyan-400 bg-cyan-400/10" />
          <QuickLink href="/app/payroll?tab=employees" icon={<Users className="h-5 w-5" />} label="Staff" color="text-violet-400 bg-violet-400/10" />
          <QuickLink href="/app/tips?tab=well" icon={<Gauge className="h-5 w-5" />} label="Well Performance" color="text-rose-400 bg-rose-400/10" />
        </div>
      </div>

      {/* ── Reorder Suggestions ────────────────────────────────────────────── */}
      {autoReorderEnabled && reorderGroups.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            Reorder Suggestions
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reorderGroups.map(({ rep, items: repItems }) => (
              <div key={rep.id} className="rounded-xl border bg-card overflow-hidden">
                <div className="px-5 py-3 border-b flex items-center justify-between">
                  <p className="text-sm font-semibold truncate">{rep.name}</p>
                  <Link
                    href={`/app/reps?order=${rep.id}`}
                    className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0 ml-2"
                  >
                    Order <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
                <div className="divide-y">
                  {repItems.slice(0, 4).map((item) => (
                    <div key={item.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                      <span className="text-sm truncate">{item.name}</span>
                      <span className={`text-xs tabular-nums shrink-0 ${item.current_stock === 0 ? 'text-red-400 font-semibold' : 'text-amber-400'}`}>
                        {item.current_stock === 0 ? 'OUT' : `${item.current_stock} / ${item.par_level}`}
                      </span>
                    </div>
                  ))}
                  {repItems.length > 4 && (
                    <div className="px-5 py-2 text-xs text-muted-foreground">
                      +{repItems.length - 4} more items
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Inventory Snapshot ─────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Inventory Snapshot</p>
            <Link href="/app/inventory" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">

            {/* Category breakdown */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  By Category
                </h2>
                <span className="text-xs text-muted-foreground">{items.length} total items</span>
              </div>
              <div className="divide-y">
                {categoryRows.map(([cat, { total, low }]) => {
                  const healthPct = total > 0 ? ((total - low) / total) * 100 : 100;
                  return (
                    <div key={cat} className="flex items-center gap-4 px-5 py-3">
                      <span className="text-sm text-muted-foreground w-32 shrink-0 truncate">{cat}</span>
                      <div className="flex-1 min-w-0">
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${low > 0 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                            style={{ width: `${healthPct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm tabular-nums font-medium w-8 text-right shrink-0">{total}</span>
                      {low > 0 && (
                        <span className="text-xs tabular-nums text-amber-400 w-16 text-right shrink-0">
                          {low} low
                        </span>
                      )}
                      {low === 0 && (
                        <span className="text-xs text-muted-foreground w-16 text-right shrink-0">all good</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Low stock list */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Running Low
                </h2>
                <span className="text-xs text-muted-foreground">
                  {lowStockItems.length === 0 ? 'All stocked' : `${lowStockItems.length} item${lowStockItems.length > 1 ? 's' : ''}`}
                </span>
              </div>
              {lowStockItems.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <CheckCircle className="h-6 w-6 text-emerald-500" />
                  Everything is stocked above par
                </div>
              ) : (
                <div className="divide-y">
                  {lowStockItems.slice(0, 8).map((item) => {
                    const pct = item.par_level! > 0 ? (item.current_stock / item.par_level!) * 100 : 0;
                    const critical = item.current_stock === 0;
                    return (
                      <div key={item.id} className="flex items-center gap-4 px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.current_stock} / {item.par_level} {item.unit}
                          </p>
                        </div>
                        <div className="w-20 shrink-0">
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-1">
                            <div
                              className={`h-full rounded-full ${critical ? 'bg-red-500' : 'bg-amber-400'}`}
                              style={{ width: `${Math.max(pct, critical ? 0 : 4)}%` }}
                            />
                          </div>
                          <p className={`text-xs tabular-nums text-right ${critical ? 'text-red-400 font-semibold' : 'text-amber-400'}`}>
                            {critical ? 'OUT' : `${Math.round(pct)}%`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {lowStockItems.length > 8 && (
                    <Link href="/app/inventory" className="flex items-center justify-center px-5 py-3 text-xs text-muted-foreground hover:text-primary transition-colors">
                      +{lowStockItems.length - 8} more · View all
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom section ─────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-5">

        {/* Recent nights — wider (NOW WITH CHART) */}
        <div className="lg:col-span-3 rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent Nights
            </h2>
            <span className="text-xs text-muted-foreground">Last 7 nights</span>
          </div>

          {nightsData.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No Z reports imported yet
            </div>
          ) : (
            <>
              {/* ← NEW CHART */}
              <div className="px-5 pt-6 pb-2">
                <DashboardRevenueChart data={nightsData} />
              </div>

                            {/* Keep your original detailed rows below the chart */}
              <div className="divide-y px-5">
                {nightsData.map((n) => (
                  <div key={n.nightDate} className="flex items-center gap-4 py-3">
                    <span className="text-sm text-muted-foreground w-28 shrink-0">{fmtDate(n.nightDate)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${maxSales > 0 ? (n.totalSales / maxSales) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm tabular-nums font-medium w-24 text-right shrink-0">
                      ${n.totalSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-sm tabular-nums text-cyan-400 w-20 text-right shrink-0">
                      ${n.totalTips.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                    <span className={`text-xs tabular-nums font-medium w-12 text-right shrink-0 ${
                      n.tipPercent >= 15 ? 'text-primary' : n.tipPercent >= 12 ? 'text-amber-400' : 'text-muted-foreground'
                    }`}>
                      {n.tipPercent.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Status panel — narrower (unchanged) */}
        <div className="lg:col-span-2 space-y-4">

          {/* Staff status */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Staff Status
              </h2>
            </div>
            <div className="divide-y">
              <StatusRow
                href="/app/payroll?tab=employees"
                label="Total staff"
                value={(employees ?? []).filter((e) => !EXCLUDED.has(e.name.toLowerCase())).length.toString()}
              />
              <StatusRow
                href="/app/payroll?tab=employees"
                label="Configured"
                value={(employees ?? []).filter((e) => !EXCLUDED.has(e.name.toLowerCase()) && e.role && e.hourly_rate !== null).length.toString()}
                ok
              />
              {unconfiguredEmployees.length > 0 && (
                <StatusRow
                  href="/app/payroll?tab=employees"
                  label="Need setup"
                  value={unconfiguredEmployees.length.toString()}
                  warn
                />
              )}
            </div>
          </div>

          {/* Tip health */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Tip Health
              </h2>
            </div>
            <div className="divide-y">
              <StatusRow
                href="/app/tips"
                label="Avg tip %"
                value={allTipPcts.length > 0 ? `${(popMean * 100).toFixed(1)}%` : '—'}
              />
              <StatusRow
                href="/app/tips?tab=flags"
                label="Flagged servers"
                value={flaggedCount.toString()}
                warn={flaggedCount > 0}
                ok={flaggedCount === 0}
              />
              <StatusRow
                href="/app/tips?tab=totals"
                label="Nights tracked"
                value={(recentNights ? [...new Set(recentNights.map((r) => r.report_date))].length : 0).toString()}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components (unchanged) ───────────────────────────────────────────────

function StatCard({
  label, value, icon, accent, muted, empty,
}: {
  label: string; value: string; icon: React.ReactNode;
  accent: 'emerald' | 'cyan' | 'primary'; muted?: boolean; empty?: boolean;
}) {
  const borderColor = { emerald: 'border-l-emerald-400', cyan: 'border-l-cyan-400', primary: 'border-l-primary' }[accent];
  const textColor = { emerald: 'text-emerald-400', cyan: 'text-cyan-400', primary: 'text-primary' }[accent];
  const iconColor = { emerald: 'text-emerald-400', cyan: 'text-cyan-400', primary: 'text-primary' }[accent];

  return (
    <div className={`rounded-xl border border-l-4 ${borderColor} bg-card px-5 py-4 ${muted ? 'opacity-80' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${empty ? 'text-muted-foreground' : textColor}`}>
        {empty ? '—' : value}
      </p>
    </div>
  );
}

function QuickLink({ href, icon, label, color }: { href: string; icon: React.ReactNode; label: string; color: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-2.5 rounded-xl border bg-card px-3 py-5 text-center hover:bg-muted/50 transition-colors"
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${color} transition-transform group-hover:scale-110`}>
        {icon}
      </span>
      <span className="text-xs font-medium leading-tight">{label}</span>
    </Link>
  );
}

function StatusRow({ href, label, value, ok, warn }: { href: string; label: string; value: string; ok?: boolean; warn?: boolean }) {
  return (
    <Link href={href} className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold tabular-nums ${warn ? 'text-yellow-400' : ok ? 'text-primary' : ''}`}>
          {value}
        </span>
        {ok && <CheckCircle className="h-3.5 w-3.5 text-primary" />}
        {warn && <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />}
      </div>
    </Link>
  );
}