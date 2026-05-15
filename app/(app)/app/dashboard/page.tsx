import Link from 'next/link';
import dynamicImport from 'next/dynamic';
import {
  Package, AlertTriangle, TrendingUp, BarChart2, Banknote,
  Users, FlaskConical, Plus, ArrowUpRight, Zap,
  CheckCircle, ShoppingCart, Activity, RefreshCw,
  Clock, Scale,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const RevenueChart = dynamicImport(() => import('./_components/DashBoardRevenueChart'));

export const dynamic = 'force-dynamic';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function getWeekStart() {
  const t = new Date();
  const d = t.getDay();
  const m = new Date(t);
  m.setDate(t.getDate() - (d === 0 ? 6 : d - 1));
  return toDate(m);
}

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtMoney(n: number, compact = false) {
  if (compact && n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function timeAgo(isoStr: string) {
  const secs = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (secs < 60)   return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function getItemName(raw: unknown): string {
  if (!raw) return 'Unknown item';
  const obj = Array.isArray(raw) ? raw[0] : raw;
  return (obj as { name?: string })?.name ?? 'Unknown item';
}

function getCatName(raw: unknown): string {
  if (!raw) return 'Uncategorized';
  const obj = Array.isArray(raw) ? raw[0] : raw;
  return (obj as { name?: string })?.name ?? 'Uncategorized';
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const REASON_LABEL: Record<string, string> = {
  spillage:    'Spillage',
  comp:        'Comped',
  staff_drink: 'Staff drink',
  recount:     'Recount adj.',
  delivery:    'Delivery received',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const { org } = await getCurrentOrg();
  const supabase = await createClient();
  const orgId    = org.id;
  const today    = toDate(new Date());
  const weekStart = getWeekStart();

  const [
    { data: recentNights },
    { data: weekDays },
    { data: employees },
    { data: inventoryItems },
    { data: recentActivity },
    { data: recentOrders },
    { data: weekUsage },
    { data: pendingOrdersData },
  ] = await Promise.all([
    supabase.from('z_report_days').select('report_date, total_sales, cash_tips, cc_tips').eq('organization_id', orgId).order('report_date', { ascending: false }).limit(7),
    supabase.from('z_report_days').select('total_sales, cash_tips, cc_tips').eq('organization_id', orgId).gte('report_date', weekStart).lte('report_date', today),
    supabase.from('employees').select('id, name, role, hourly_rate').eq('organization_id', orgId),
    supabase.from('inventory_items').select('id, name, unit, current_stock, par_level, cost_price, rep_id, inventory_categories(name), reps(id, name)').eq('organization_id', orgId).eq('is_active', true).order('name'),
    supabase.from('usage_logs').select('item_id, quantity, reason, created_at, inventory_items(name)').eq('organization_id', orgId).neq('reason', 'delivery').order('created_at', { ascending: false }).limit(8),
    supabase.from('rep_orders').select('id, status, created_at, reps(name)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(4),
    supabase.from('usage_logs').select('item_id, quantity, inventory_items(name)').eq('organization_id', orgId).neq('reason', 'delivery').gte('created_at', weekStart + 'T00:00:00Z').limit(150),
    supabase.from('rep_orders').select('id').eq('organization_id', orgId).in('status', ['sent', 'confirmed']),
  ]);

  // ── Metrics ───────────────────────────────────────────────────────────────

  const lastNight      = recentNights?.[0] ?? null;
  const lastNightSales = lastNight?.total_sales ?? 0;
  const lastNightTips  = (lastNight?.cash_tips ?? 0) + (lastNight?.cc_tips ?? 0);
  const lastNightTipPct = lastNightSales > 0 ? (lastNightTips / lastNightSales) * 100 : 0;

  const weekSales = (weekDays ?? []).reduce((s, d) => s + (d.total_sales ?? 0), 0);
  const weekTips  = (weekDays ?? []).reduce((s, d) => s + (d.cash_tips ?? 0) + (d.cc_tips ?? 0), 0);

  const items = inventoryItems ?? [];

  const inventoryValue = items.reduce(
    (s, i) => s + (i.current_stock ?? 0) * ((i as unknown as { cost_price?: number }).cost_price ?? 0), 0,
  );

  const itemsWithPar  = items.filter((i) => i.par_level !== null && i.par_level > 0);
  const lowStockItems = itemsWithPar
    .filter((i) => i.current_stock < i.par_level!)
    .sort((a, b) => (a.current_stock / (a.par_level ?? 1)) - (b.current_stock / (b.par_level ?? 1)));
  const parCompliancePct = itemsWithPar.length > 0
    ? ((itemsWithPar.length - lowStockItems.length) / itemsWithPar.length) * 100
    : 100;

  const pendingOrders = (pendingOrdersData ?? []).length;

  const EXCLUDED = new Set(['front door']);
  const unconfiguredEmployees = (employees ?? []).filter(
    (e) => !EXCLUDED.has(e.name.toLowerCase()) && (!e.role || e.hourly_rate === null),
  );

  // Fast movers this week (group by item)
  const fastMoverMap = new Map<string, { name: string; qty: number }>();
  for (const log of weekUsage ?? []) {
    const name = getItemName(log.inventory_items);
    const prev = fastMoverMap.get(log.item_id) ?? { name, qty: 0 };
    fastMoverMap.set(log.item_id, { name, qty: prev.qty + (log.quantity ?? 0) });
  }
  const fastMovers = [...fastMoverMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);

  // Reorder suggestions
  const reorderItems = items.filter((i) => i.par_level !== null && i.current_stock < i.par_level && i.rep_id);
  const reorderByRep = new Map<string, { rep: { id: string; name: string }; items: typeof reorderItems }>();
  for (const item of reorderItems) {
    const rep = item.reps as unknown as { id: string; name: string } | null;
    if (!rep) continue;
    if (!reorderByRep.has(rep.id)) reorderByRep.set(rep.id, { rep, items: [] });
    reorderByRep.get(rep.id)!.items.push(item);
  }
  const reorderGroups = [...reorderByRep.values()];

  const nightsData = (recentNights ?? []).map((d) => ({
    nightDate:  d.report_date as string,
    totalSales: d.total_sales as number,
    totalTips:  (d.cash_tips as number) + (d.cc_tips as number),
    tipPercent: d.total_sales > 0 ? ((d.cash_tips + d.cc_tips) / d.total_sales) * 100 : 0,
  }));

  const hasAlerts = unconfiguredEmployees.length > 0 || reorderGroups.length > 0;

  const parColor = parCompliancePct >= 85
    ? 'bg-emerald-500' : parCompliancePct >= 60 ? 'bg-amber-400' : 'bg-red-500';
  const parText  = parCompliancePct >= 85
    ? 'text-emerald-600' : parCompliancePct >= 60 ? 'text-amber-600' : 'text-destructive';

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── 1. Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{org.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {org.pos_provider && (
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {org.pos_provider} connected
          </div>
        )}
      </div>

      {/* ── 2. Hero KPIs ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Package} label="Inventory Value" value={fmtMoney(inventoryValue, true)}
          sub={`${items.length} items tracked`} status="info"
        />
        <KpiCard
          icon={AlertTriangle} label="Low Stock" value={String(lowStockItems.length)}
          sub={`${parCompliancePct.toFixed(0)}% par compliance`}
          status={lowStockItems.length === 0 ? 'good' : lowStockItems.length <= 3 ? 'warn' : 'critical'}
        />
        <KpiCard
          icon={BarChart2} label="Last Night" value={lastNight ? fmtMoney(lastNightSales, true) : '—'}
          sub={lastNight ? `${fmtMoney(lastNightTips, true)} tips` : 'No data imported'}
          status={lastNightSales > 0 ? 'good' : 'info'}
        />
        <KpiCard
          icon={TrendingUp} label="Tip Rate" value={lastNight ? `${lastNightTipPct.toFixed(1)}%` : '—'}
          sub={lastNight ? `Last night · ${fmtDate(lastNight.report_date as string)}` : 'Import Z reports'}
          status={lastNightTipPct >= 15 ? 'good' : lastNightTipPct >= 12 ? 'warn' : lastNightSales > 0 ? 'critical' : 'info'}
        />
      </div>

      {/* ── 3. Quick Actions ───────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction icon={Package}     label="Adjust Stock"    sub="Update levels"       href="/app/inventory"                color="primary"  />
          <QuickAction icon={Users}       label="New Rep Order"   sub="Place with supplier" href="/app/reps"                      color="amber"    />
          <QuickAction icon={FlaskConical} label="Pour Report"    sub="Weigh bottles"       href="/app/inventory/weigh"           color="violet"   />
          <QuickAction icon={Plus}        label="Add Item"        sub="New inventory SKU"   href="/app/inventory"                color="emerald"  />
        </div>
      </div>

      {/* ── 4. Main grid ───────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-5 gap-5">

        {/* Left: Inventory Health (3/5) */}
        <div className="lg:col-span-3 space-y-5">

          {/* Par compliance + Low stock */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Scale className="h-4 w-4 text-muted-foreground" /> Inventory Health
                </CardTitle>
                <Link href="/app/inventory/analytics" className="text-xs text-primary hover:underline flex items-center gap-1">
                  Analytics <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Par compliance gauge */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Par Compliance</span>
                  <span className={`font-bold tabular-nums ${parText}`}>{parCompliancePct.toFixed(0)}%</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${parColor} rounded-full transition-all duration-500`} style={{ width: `${parCompliancePct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {itemsWithPar.length - lowStockItems.length} of {itemsWithPar.length} items at or above par
                  {lowStockItems.length > 0 && ` · ${items.filter((i) => i.current_stock === 0).length} out of stock`}
                </p>
              </div>

              {/* Low stock list */}
              {lowStockItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Needs Attention</p>
                  <div className="space-y-1">
                    {lowStockItems.slice(0, 5).map((item) => {
                      const pct      = item.par_level! > 0 ? (item.current_stock / item.par_level!) * 100 : 0;
                      const critical = item.current_stock === 0;
                      const cat      = getCatName(item.inventory_categories);
                      return (
                        <div key={item.id} className="flex items-center gap-3 py-1.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate leading-none">{item.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{cat}</p>
                          </div>
                          <div className="w-24 shrink-0">
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-1">
                              <div className={`h-full rounded-full ${critical ? 'bg-red-500' : 'bg-amber-400'}`} style={{ width: `${Math.max(pct, critical ? 0 : 3)}%` }} />
                            </div>
                            <p className={`text-xs tabular-nums text-right ${critical ? 'text-red-500 font-semibold' : 'text-amber-600'}`}>
                              {critical ? 'OUT' : `${item.current_stock} / ${item.par_level}`}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {lowStockItems.length > 5 && (
                      <Link href="/app/inventory" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 pt-1">
                        +{lowStockItems.length - 5} more low-stock items <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {lowStockItems.length === 0 && (
                <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2.5">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">All items stocked above par</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fast movers */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" /> Fastest Moving This Week
                </CardTitle>
                <Link href="/app/inventory/analytics" className="text-xs text-primary hover:underline flex items-center gap-1">
                  Full analytics <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {fastMovers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No usage data this week. Log stock adjustments to see movers.
                </p>
              ) : (
                <div className="space-y-3">
                  {fastMovers.map((item, i) => {
                    const max = fastMovers[0]?.qty ?? 1;
                    const pct = (item.qty / max) * 100;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate leading-none">{item.name}</p>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1.5">
                            <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="text-sm tabular-nums font-semibold text-primary shrink-0">
                          {item.qty.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Activity + Last Night (2/5) */}
        <div className="lg:col-span-2 space-y-5">

          {/* Recent Activity */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" /> Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              {((recentActivity ?? []).length === 0 && (recentOrders ?? []).length === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-8 px-4">No recent activity recorded</p>
              ) : (
                <div className="divide-y">
                  {(recentActivity ?? []).slice(0, 5).map((log, i) => {
                    const name   = getItemName(log.inventory_items);
                    const label  = REASON_LABEL[log.reason] ?? log.reason;
                    const isWarn = ['spillage', 'comp', 'recount'].includes(log.reason);
                    return (
                      <div key={i} className="flex items-start gap-3 px-4 py-3">
                        <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${isWarn ? 'bg-amber-100 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
                          <Package className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate leading-snug">{name}</p>
                          <p className="text-xs text-muted-foreground">{label} · {log.quantity} units</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 mt-0.5 whitespace-nowrap">
                          {timeAgo(log.created_at as string)}
                        </span>
                      </div>
                    );
                  })}
                  {(recentOrders ?? []).slice(0, 3).map((order) => {
                    const repName = getItemName(order.reps);
                    return (
                      <div key={order.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="mt-0.5 p-1.5 rounded-lg bg-violet-100 text-violet-600 shrink-0">
                          <ShoppingCart className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate leading-snug">Order to {repName}</p>
                          <p className="text-xs text-muted-foreground capitalize">{order.status}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 mt-0.5 whitespace-nowrap">
                          {timeAgo(order.created_at as string)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Last night stats card */}
          {lastNight && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" /> Last Night
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">{fmtDate(lastNight.report_date as string)}</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <BarChart2 className="h-3.5 w-3.5" /> Sales
                    </span>
                    <span className="text-sm font-bold tabular-nums">{fmtMoney(lastNightSales)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Banknote className="h-3.5 w-3.5" /> Tips
                    </span>
                    <span className="text-sm font-bold tabular-nums text-cyan-600">{fmtMoney(lastNightTips)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5" /> Tip Rate
                    </span>
                    <span className={`text-sm font-bold tabular-nums ${lastNightTipPct >= 15 ? 'text-emerald-600' : lastNightTipPct >= 12 ? 'text-amber-600' : 'text-destructive'}`}>
                      {lastNightTipPct.toFixed(1)}%
                    </span>
                  </div>
                  {weekSales > 0 && (
                    <div className="flex items-center justify-between border-t pt-3">
                      <span className="text-xs text-muted-foreground">Week so far</span>
                      <span className="text-xs font-semibold tabular-nums">
                        {fmtMoney(weekSales, true)} sales · {fmtMoney(weekTips, true)} tips
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pending orders badge */}
          {pendingOrders > 0 && (
            <Link href="/app/reps" className="block">
              <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 flex items-center justify-between hover:bg-violet-100 transition-colors">
                <div className="flex items-center gap-2.5">
                  <ShoppingCart className="h-4 w-4 text-violet-600" />
                  <div>
                    <p className="text-sm font-semibold text-violet-800">{pendingOrders} pending order{pendingOrders > 1 ? 's' : ''}</p>
                    <p className="text-xs text-violet-600">Awaiting delivery confirmation</p>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-violet-500" />
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* ── 5. Revenue chart ───────────────────────────────────────────────── */}
      {nightsData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Revenue Trend — Last {nightsData.length} Nights</CardTitle>
              <span className="text-xs text-muted-foreground">Sales · Tips · Tip %</span>
            </div>
          </CardHeader>
          <CardContent>
            <RevenueChart data={nightsData} />
            {/* Mini table */}
            <div className="mt-4 divide-y">
              {nightsData.map((n) => (
                <div key={n.nightDate} className="flex items-center gap-3 py-2 text-sm">
                  <span className="text-muted-foreground w-32 shrink-0 text-xs">{fmtDate(n.nightDate)}</span>
                  <span className="font-medium tabular-nums w-24 text-right shrink-0">{fmtMoney(n.totalSales)}</span>
                  <span className="text-cyan-600 tabular-nums w-20 text-right shrink-0">{fmtMoney(n.totalTips)}</span>
                  <span className={`text-xs tabular-nums font-medium w-12 text-right shrink-0 ${n.tipPercent >= 15 ? 'text-emerald-600' : n.tipPercent >= 12 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                    {n.tipPercent.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {nightsData.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No sales data yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Import Z Reports to see revenue trends</p>
            <Link href="/app/payroll?tab=import" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors">
              Import Z Reports
            </Link>
          </CardContent>
        </Card>
      )}

      {/* ── 6. Alerts ──────────────────────────────────────────────────────── */}
      {hasAlerts && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Alerts &amp; Actions</p>

          <div className="grid sm:grid-cols-2 gap-4">
            {unconfiguredEmployees.length > 0 && (
              <Link href="/app/payroll?tab=employees">
                <div className="rounded-xl border border-yellow-300/60 bg-yellow-50 px-4 py-3.5 hover:bg-yellow-100 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-yellow-700" />
                    <span className="text-sm font-semibold text-yellow-800">Staff Setup Needed</span>
                  </div>
                  <p className="text-xs text-yellow-700">
                    {unconfiguredEmployees.length} employee{unconfiguredEmployees.length > 1 ? 's' : ''} missing role or hourly rate
                  </p>
                </div>
              </Link>
            )}

            {reorderGroups.map(({ rep, items: repItems }) => (
              <Link key={rep.id} href={`/app/reps?order=${rep.id}`}>
                <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3.5 hover:bg-amber-100 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <RefreshCw className="h-4 w-4 text-amber-700" />
                    <span className="text-sm font-semibold text-amber-800">Reorder from {rep.name}</span>
                  </div>
                  <p className="text-xs text-amber-700">
                    {repItems.slice(0, 2).map((i) => i.name).join(', ')}
                    {repItems.length > 2 ? ` + ${repItems.length - 2} more` : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

type KpiStatus = 'good' | 'warn' | 'critical' | 'info';

const STATUS_ICON_BG: Record<KpiStatus, string> = {
  good:     'bg-emerald-100 text-emerald-600',
  warn:     'bg-amber-100 text-amber-600',
  critical: 'bg-red-100 text-red-600',
  info:     'bg-primary/10 text-primary',
};
const STATUS_VALUE: Record<KpiStatus, string> = {
  good:     'text-emerald-700',
  warn:     'text-amber-700',
  critical: 'text-red-700',
  info:     'text-foreground',
};

function KpiCard({ label, value, sub, icon: Icon, status }: {
  label: string; value: string; sub: string;
  icon: React.ComponentType<{ className?: string }>; status: KpiStatus;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className={`inline-flex p-2 rounded-xl mb-3 ${STATUS_ICON_BG[status]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <p className={`text-2xl sm:text-3xl font-bold tabular-nums leading-none ${STATUS_VALUE[status]}`}>{value}</p>
        <p className="text-xs font-medium text-muted-foreground mt-2">{label}</p>
        <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{sub}</p>
      </CardContent>
    </Card>
  );
}

const ACTION_STYLES: Record<string, { icon: string; border: string; label: string }> = {
  primary: { icon: 'bg-primary/10 text-primary group-hover:bg-primary/15',       border: 'hover:border-primary/30',   label: 'text-foreground' },
  amber:   { icon: 'bg-amber-100 text-amber-600 group-hover:bg-amber-200',       border: 'hover:border-amber-300/60', label: 'text-foreground' },
  violet:  { icon: 'bg-violet-100 text-violet-600 group-hover:bg-violet-200',    border: 'hover:border-violet-300/60',label: 'text-foreground' },
  emerald: { icon: 'bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200', border: 'hover:border-emerald-300/60',label: 'text-foreground' },
};

function QuickAction({ label, sub, icon: Icon, href, color }: {
  label: string; sub: string; icon: React.ComponentType<{ className?: string }>;
  href: string; color: keyof typeof ACTION_STYLES;
}) {
  const s = ACTION_STYLES[color];
  return (
    <Link href={href} className={`group rounded-xl border bg-card p-4 flex flex-col gap-3 transition-all duration-150 active:scale-[0.98] ${s.border}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${s.icon}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className={`text-sm font-semibold leading-tight ${s.label}`}>{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </div>
    </Link>
  );
}
