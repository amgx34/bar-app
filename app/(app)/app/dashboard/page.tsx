import type { Metadata } from 'next';
import Link from 'next/link';
import dynamicImport from 'next/dynamic';
import {
  Package, AlertTriangle, TrendingUp, BarChart2, Banknote,
  Users, FlaskConical, Plus, ArrowUpRight, Zap,
  CheckCircle, ShoppingCart, Activity, RefreshCw,
  Clock, Scale,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';
import { posItemMatchKey } from '@/lib/pos/excluded-items';
import { computeVelocity } from '@/lib/pos/velocity';
import { unitsPerSale } from '@/lib/pos/pour';
import { assessSyncHealth } from '@/lib/pos/sync-health';
import { SyncStatusStrip } from './_components/sync-status-strip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const RevenueChart = dynamicImport(() => import('./_components/DashBoardRevenueChart'));

export const dynamic = 'force-dynamic';

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  pos_sale:     'POS sales',
  pos_reversal: 'POS correction',
};

// Recent Activity is a feed of things PEOPLE did. POS depletion writes a row per
// item per day on a five-minute cycle, so leaving it in would bury every
// spillage, comp and recount under an unbroken wall of automated movements.
// Deliveries have always been excluded here for the same reason.
const ACTIVITY_FEED_EXCLUDED = '("delivery","pos_sale","pos_reversal")';

// Consumption, by contrast, is exactly what a POS sale is — so `pos_sale` stays
// in the 30-day total and only stock-ADDING movements are filtered out.
const NON_CONSUMPTION_FILTER = '("delivery","pos_reversal")';

// ── Page ──────────────────────────────────────────────────────────────────────

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const { org } = await getCurrentOrg();
  // Use admin client — same pattern as the inventory page — to bypass RLS
  // policies that may reference the old `organization_members` table name.
  // org is already validated by getCurrentOrg() above.
  const supabase = createAdminClient();
  const orgId = org.id;

  // 30-day window for usage. usage_logs timestamps its rows `logged_at`, not
  // `created_at` — querying the wrong name returns an error, not an empty set.
  const d30ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // ── Flat queries — NO embedded joins (joins fail silently when FK isn't detected)
  const [
    { data: recentNights },
    { data: employees },
    { data: inventoryItems },
    { data: allCategories },
    { data: allReps },
    { data: recentActivity },
    { data: recentOrders },
    { data: recentUsage },
    { data: pendingOrdersData },
    { data: posSales30 },
  ] = await Promise.all([
    supabase.from('z_report_days')
      .select('report_date, total_sales, cash_tips, cc_tips')
      .eq('organization_id', orgId).order('report_date', { ascending: false }).limit(14),
    supabase.from('employees')
      .select('id, name, role, hourly_rate')
      .eq('organization_id', orgId),
    // select('*') — never fails on missing columns.
    // is_active filtered in-memory below to handle NULL values correctly.
    supabase.from('inventory_items')
      .select('*')
      .eq('organization_id', orgId)
      .order('name'),
    supabase.from('inventory_categories')
      .select('id, name, default_pour_oz')
      .eq('organization_id', orgId),
    supabase.from('reps')
      .select('id, name')
      .eq('organization_id', orgId).eq('is_active', true),
    // No join — item_id used to look up name from items array below
    supabase.from('usage_logs')
      .select('item_id, quantity, reason, logged_at')
      .eq('organization_id', orgId).not('reason', 'in', ACTIVITY_FEED_EXCLUDED)
      .order('logged_at', { ascending: false }).limit(8),
    // No join — rep_id used for lookup
    supabase.from('rep_orders')
      .select('id, status, created_at, rep_id')
      .eq('organization_id', orgId).order('created_at', { ascending: false }).limit(4),
    supabase.from('usage_logs')
      // `reason` is selected because computeVelocity needs it to drop `pos_sale`
      // rows, which describe the same units as the POS sales feed below.
      .select('item_id, quantity, reason')
      .eq('organization_id', orgId).not('reason', 'in', NON_CONSUMPTION_FILTER)
      .gte('logged_at', d30ago).limit(200),
    supabase.from('rep_orders')
      .select('id')
      .eq('organization_id', orgId).in('status', ['sent', 'confirmed']),
    // What sold. Top Movers was reading usage_logs alone and therefore showed
    // nothing for a bar that syncs a POS but never hand-logs spillage.
    supabase.from('pos_item_sales')
      .select('match_key, qty_sold, net_sales, sale_date')
      .eq('organization_id', orgId)
      .gte('sale_date', d30ago.split('T')[0]),
  ]);

  // ── Metrics ───────────────────────────────────────────────────────────────

  const nights = recentNights ?? [];
  const lastNight       = nights[0] ?? null;
  const lastNightSales  = lastNight?.total_sales ?? 0;
  const lastNightTips   = (lastNight?.cash_tips ?? 0) + (lastNight?.cc_tips ?? 0);
  const lastNightTipPct = lastNightSales > 0 ? (lastNightTips / lastNightSales) * 100 : 0;

  // Period totals from the last 14 nights (excludes the most recent night itself)
  const periodNights = nights.slice(1);
  const periodSales  = periodNights.reduce((s, d) => s + (d.total_sales ?? 0), 0);
  const periodTips   = periodNights.reduce((s, d) => s + ((d.cash_tips ?? 0) + (d.cc_tips ?? 0)), 0);

  // Filter active items in-memory: include items where is_active is true OR null
  // (NULL means the column defaulted without being set, not that it was deactivated)
  const items = (inventoryItems ?? []).filter(
    (i) => (i as Record<string, unknown>).is_active !== false,
  );

  // rep_id was added by a migration — fetch it separately so a missing column
  // never breaks the main inventory query above.
  const repAssignMap = new Map<string, string>(); // item_id → rep_id
  try {
    const { data: repRows } = await supabase
      .from('inventory_items')
      .select('id, rep_id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .not('rep_id', 'is', null);
    for (const r of repRows ?? []) {
      const row = r as { id: string; rep_id: string | null };
      if (row.rep_id) repAssignMap.set(row.id, row.rep_id);
    }
  } catch { /* rep_id column not yet in this database — skip reorder suggestions */ }

  // ── Lookup maps (replaces join-based data access) ─────────────────────────
  type RawItem = typeof items[0] & { cost_price?: number | null; rep_id?: string | null; category_id?: string | null };
  const itemNameMap = new Map(items.map((i) => [i.id, i.name]));
  const catNameMap  = new Map((allCategories ?? []).map((c) => [c.id, c.name]));
  const repNameMap  = new Map((allReps ?? []).map((r) => [r.id, r.name]));

  // cost_price lives on the raw row; TypeScript may not type it — read via cast
  const inventoryValue = items.reduce((s, i) => {
    const row  = i as RawItem;
    const cost = Number(row.cost_price ?? 0);
    return s + (i.current_stock ?? 0) * cost;
  }, 0);

  const itemsWithPar  = items.filter((i) => {
    const par = Number((i as RawItem).par_level ?? null);
    return par !== null && !isNaN(par) && par > 0;
  });
  const lowStockItems = itemsWithPar
    .filter((i) => {
      const par = Number((i as RawItem).par_level ?? 0);
      return i.current_stock < par;
    })
    .sort((a, b) => {
      const pa = Number((a as RawItem).par_level ?? 1);
      const pb = Number((b as RawItem).par_level ?? 1);
      return (a.current_stock / pa) - (b.current_stock / pb);
    });
  const parCompliancePct = itemsWithPar.length > 0
    ? ((itemsWithPar.length - lowStockItems.length) / itemsWithPar.length) * 100
    : 100;

  const pendingOrders = (pendingOrdersData ?? []).length;

  const EXCLUDED = new Set(['front door']);
  const unconfiguredEmployees = (employees ?? []).filter(
    (e) => !EXCLUDED.has(e.name.toLowerCase()) && (!e.role || e.hourly_rate === null),
  );

  // Top movers — what SOLD plus what was logged as lost, over the last 30 days.
  //
  // This read usage_logs alone, which is why it was permanently empty for any
  // bar that syncs a POS but does not hand-log spillage: nothing writes a usage
  // log in that case, while pos_item_sales fills up nightly. Stock level was
  // never an input, so having plenty on the shelf changed nothing.
  // Item -> category -> organisation, the same chain the ingest route depletes
  // with. Without it, drinks sold were added to stock lost as though a shot
  // were a bottle and top movers ranked poured spirits far too high.
  const orgPourOz = Number(
    (org.bar_settings as { default_pour_oz?: number } | null)?.default_pour_oz,
  ) || null;
  const catPourById = new Map<string, number | null>(
    (allCategories ?? []).map((c) => [c.id as string, Number(c.default_pour_oz) || null]),
  );

  const movers = computeVelocity(
    items.map((i) => ({
      id: i.id,
      name: i.name,
      matchKey: posItemMatchKey(i.name),
      unitsPerSale: unitsPerSale(
        { bottleSizeMl: i.bottle_size_ml ?? null, pourSizeOz: i.pour_size_oz ?? null },
        { categoryPourOz: catPourById.get(i.category_id) ?? null, orgPourOz },
      ),
    })),
    (posSales30 ?? []).map((s) => ({
      matchKey: s.match_key,
      qtySold: Number(s.qty_sold) || 0,
      netSales: Number(s.net_sales) || 0,
      saleDate: s.sale_date,
    })),
    (recentUsage ?? []).map((l) => ({
      itemId: l.item_id,
      quantity: Number(l.quantity) || 0,
      reason: l.reason,
    })),
    30,
  );
  const fastMovers = movers.slice(0, 5).map((m) => ({ name: m.name, qty: m.unitsMoved }));

  // Reorder suggestions — use the separately-fetched repAssignMap
  const reorderItems = items.filter((i) => {
    const par = Number((i as RawItem).par_level ?? 0);
    return par > 0 && i.current_stock < par && repAssignMap.has(i.id);
  });
  const reorderByRep = new Map<string, { rep: { id: string; name: string }; items: typeof reorderItems }>();
  for (const item of reorderItems) {
    const repId   = repAssignMap.get(item.id);
    const repName = repId ? repNameMap.get(repId) : undefined;
    if (!repId || !repName) continue;
    if (!reorderByRep.has(repId)) reorderByRep.set(repId, { rep: { id: repId, name: repName }, items: [] });
    reorderByRep.get(repId)!.items.push(item);
  }
  const reorderGroups = [...reorderByRep.values()];

  const nightsData = nights.map((d) => ({
    nightDate:  d.report_date as string,
    totalSales: d.total_sales as number,
    totalTips:  (d.cash_tips as number) + (d.cc_tips as number),
    tipPercent: d.total_sales > 0 ? ((d.cash_tips + d.cc_tips) / d.total_sales) * 100 : 0,
  }));

  // Whether the POS agent is still feeding this bar. Renders nothing at all for
  // a bar with no agent, so it never becomes background noise.
  const syncHealth = assessSyncHealth(
    org.pos_config as Record<string, unknown> | null,
    org.pos_provider as string | null,
  );

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
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 shrink-0">
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
          {/* Replaced the Pour Report shortcut: weighing bottles is a weekly
              job, logging the jar is a nightly one, and until it is entered
              every tip split for that night is short by the cash. */}
          <QuickAction icon={Banknote}     label="Log Cash Tips" sub="End of night"        href="/app/payroll?tab=split"         color="violet"   />
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
                      const par      = Number((item as RawItem).par_level ?? 0);
                      const pct      = par > 0 ? (item.current_stock / par) * 100 : 0;
                      const critical = item.current_stock === 0;
                      const catId    = (item as RawItem).category_id;
                      const cat      = (catId ? catNameMap.get(catId) : undefined) ?? 'Uncategorized';
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
                              {critical ? 'OUT' : `${item.current_stock} / ${par}`}
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
                <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg px-3 py-2.5">
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
                  <Zap className="h-4 w-4 text-amber-500" /> Top Movers (30 Days)
                </CardTitle>
                <Link href="/app/inventory/analytics" className="text-xs text-primary hover:underline flex items-center gap-1">
                  Full analytics <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {fastMovers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nothing has moved in the last 30 days. This counts what sold through
                  the POS plus anything logged as spilled or comped — not what is on
                  the shelf, so stock levels will not change it.
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
                    const name   = itemNameMap.get(log.item_id) ?? 'Unknown item';
                    const label  = REASON_LABEL[log.reason] ?? log.reason;
                    const isWarn = ['spillage', 'comp', 'recount'].includes(log.reason);
                    return (
                      <div key={i} className="flex items-start gap-3 px-4 py-3">
                        <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${isWarn ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
                          <Package className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate leading-snug">{name}</p>
                          <p className="text-xs text-muted-foreground">{label} · {log.quantity} units</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 mt-0.5 whitespace-nowrap">
                          {timeAgo(log.logged_at as string)}
                        </span>
                      </div>
                    );
                  })}
                  {(recentOrders ?? []).slice(0, 3).map((order) => {
                    const repName = repNameMap.get((order as Record<string, unknown>).rep_id as string) ?? 'Rep';
                    return (
                      <div key={order.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="mt-0.5 p-1.5 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 shrink-0">
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
                  {periodSales > 0 && (
                    <div className="flex items-center justify-between border-t pt-3">
                      <span className="text-xs text-muted-foreground">Prior {periodNights.length} nights</span>
                      <span className="text-xs font-semibold tabular-nums">
                        {fmtMoney(periodSales, true)} sales · {fmtMoney(periodTips, true)} tips
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
              <div className="rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-950/40 px-4 py-3 flex items-center justify-between hover:bg-violet-100 dark:bg-violet-900/40 transition-colors">
                <div className="flex items-center gap-2.5">
                  <ShoppingCart className="h-4 w-4 text-violet-600" />
                  <div>
                    <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">{pendingOrders} pending order{pendingOrders > 1 ? 's' : ''}</p>
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

      {/* ── 5b. POS sync health ────────────────────────────────────────────── */}
      <SyncStatusStrip health={syncHealth} />

      {/* ── 6. Alerts ──────────────────────────────────────────────────────── */}
      {hasAlerts && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Alerts &amp; Actions</p>

          <div className="grid sm:grid-cols-2 gap-4">
            {unconfiguredEmployees.length > 0 && (
              <Link href="/app/payroll?tab=employees">
                <div className="rounded-xl border border-yellow-300/60 bg-yellow-50 dark:bg-yellow-950/40 px-4 py-3.5 hover:bg-yellow-100 dark:bg-yellow-900/40 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-yellow-700 dark:text-yellow-300" />
                    <span className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">Staff Setup Needed</span>
                  </div>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">
                    {unconfiguredEmployees.length} employee{unconfiguredEmployees.length > 1 ? 's' : ''} missing role or hourly rate
                  </p>
                </div>
              </Link>
            )}

            {reorderGroups.map(({ rep, items: repItems }) => (
              <Link key={rep.id} href={`/app/reps?order=${rep.id}`}>
                <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-3.5 hover:bg-amber-100 dark:bg-amber-900/40 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <RefreshCw className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                    <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">Reorder from {rep.name}</span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
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
  good:     'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600',
  warn:     'bg-amber-100 dark:bg-amber-900/40 text-amber-600',
  critical: 'bg-red-100 dark:bg-red-900/40 text-red-600',
  info:     'bg-primary/10 text-primary',
};
const STATUS_VALUE: Record<KpiStatus, string> = {
  good:     'text-emerald-700 dark:text-emerald-300',
  warn:     'text-amber-700 dark:text-amber-300',
  critical: 'text-red-700 dark:text-red-300',
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
  amber:   { icon: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 group-hover:bg-amber-200',       border: 'hover:border-amber-300/60', label: 'text-foreground' },
  violet:  { icon: 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 group-hover:bg-violet-200',    border: 'hover:border-violet-300/60',label: 'text-foreground' },
  emerald: { icon: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 group-hover:bg-emerald-200', border: 'hover:border-emerald-300/60',label: 'text-foreground' },
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
