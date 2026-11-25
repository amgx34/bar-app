import type { Metadata } from 'next';
import Link from 'next/link';
import dynamicImport from 'next/dynamic';
import {
  Package, AlertTriangle, BarChart2, Banknote,
  Users, Zap,
  CheckCircle, ShoppingCart, Activity, RefreshCw,
  Scale, Wallet, ChevronRight,
} from 'lucide-react';
import { cookies } from 'next/headers';
import { dismissCashTipsBanner } from './actions';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';
import { getOpenPayrollRun } from '../payroll/approval-actions';
import { canSeeOpenRun } from '@/lib/payroll/open-run';
import { posItemMatchKey } from '@/lib/pos/excluded-items';
import { computeVelocity } from '@/lib/pos/velocity';
import { unitsPerSale } from '@/lib/pos/pour';
import { assessSyncHealth } from '@/lib/pos/sync-health';
import { SyncStatusStrip } from './_components/sync-status-strip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { hasPar, isBelowPar, parRatio } from '@/lib/inventory/par';

// Reserved height, so the chart slot is never an empty box while it loads.
const RevenueChart = dynamicImport(() => import('./_components/DashBoardRevenueChart'), {
  loading: () => <div className="h-56 w-full animate-pulse rounded-lg bg-muted/60" aria-hidden />,
});

export const dynamic = 'force-dynamic';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Whole dollars, always. A compact "$1.6k" used to stand in for $1,650 on this
// page while the card beside it printed $1,650: two spellings of one figure.
function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function timeAgo(isoStr: string) {
  const secs = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (secs < 60)   return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// Clock reads live at module scope: this is a server component rendered fresh on
// every request (force-dynamic), so "now" is right, and the purity lint only
// objects to reading it inside the component body.
function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function wholeDaysSince(isoDate: string) {
  return Math.floor((Date.now() - new Date(`${isoDate}T00:00:00Z`).getTime()) / 86_400_000);
}

function localTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const { org, role } = await getCurrentOrg();
  // Use admin client — same pattern as the inventory page — to bypass RLS
  // policies that may reference the old `organization_members` table name.
  // org is already validated by getCurrentOrg() above.
  const supabase = createAdminClient();
  const orgId = org.id;
  const bannerDismissedFor = (await cookies()).get('rail_cash_banner_off')?.value;

  // 30-day window for usage. usage_logs timestamps its rows `logged_at`, not
  // `created_at` — querying the wrong name returns an error, not an empty set.
  const d30ago = isoDaysAgo(30);

  // ── Flat queries — NO embedded joins (joins fail silently when FK isn't detected)
  const [
    { data: recentNights, error: nightsErr },
    { data: employees, error: employeesErr },
    { data: inventoryItems, error: itemsErr },
    { data: allCategories, error: categoriesErr },
    { data: allReps, error: repsErr },
    { data: recentActivity, error: activityErr },
    { data: recentOrders, error: ordersErr },
    { data: recentUsage, error: usageErr },
    { data: pendingOrdersData, error: pendingErr },
    { data: posSales30, error: posSalesErr },
    openRun,
  ] = await Promise.all([
    supabase.from('z_report_days')
      .select('report_date, total_sales, cash_tips, cc_tips, cash_tips_source')
      .eq('organization_id', orgId).order('report_date', { ascending: false }).limit(14),
    // select('*') and an in-memory archived filter below, so this keeps working
    // on a database that has not yet had employees.archived_at added.
    supabase.from('employees')
      .select('*')
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
      // `shipment_id` is selected so computeVelocity can also drop a void's
      // reversal row — reason: 'other', so the NON_CONSUMPTION_FILTER below
      // (reason-based) does not catch it — from counting as consumption. See
      // isShipmentBookkeeping in lib/pos/velocity.ts.
      .select('item_id, quantity, reason, shipment_id')
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
    // Already org-scoped and role-gated inside; read-only, for the status chip.
    getOpenPayrollRun().catch(() => null),
  ]);

  // ── Metrics ───────────────────────────────────────────────────────────────

  const nights = recentNights ?? [];
  const lastNight       = nights[0] ?? null;
  const lastNightSales  = lastNight?.total_sales ?? 0;
  const lastNightTips   = (lastNight?.cash_tips ?? 0) + (lastNight?.cc_tips ?? 0);
  const lastNightTipPct = lastNightSales > 0 ? (lastNightTips / lastNightSales) * 100 : 0;

  // The newest Z report is not necessarily last night: after a closed stretch or
  // a dead feed it is older, and the card must say so rather than pass it off.
  // Three days or more, so the server's UTC clock cannot misjudge a bar's night.
  const daysSinceReport = lastNight ? wholeDaysSince(lastNight.report_date as string) : 0;
  const reportIsOld = daysSinceReport >= 3;

  // Until the jar is counted every tip split for the night is short by the cash,
  // and the POS reports 0 for nearly every bar. 'manual' means a person entered it.
  const cashTipsMissing = !!lastNight
    && (lastNight.cash_tips ?? 0) === 0
    && (lastNight as { cash_tips_source?: string | null }).cash_tips_source !== 'manual';

  // Said in words as well as colour, so the rate never rests on hue alone.
  const tipBand = lastNightSales <= 0 ? null
    : lastNightTipPct >= 15 ? 'strong' : lastNightTipPct >= 12 ? 'fair' : 'low';

  // Period totals from the last 14 nights (excludes the most recent night itself)
  const periodNights = nights.slice(1);
  const periodSales  = periodNights.reduce((s, d) => s + (d.total_sales ?? 0), 0);
  const periodTips   = periodNights.reduce((s, d) => s + ((d.cash_tips ?? 0) + (d.cc_tips ?? 0)), 0);

  // Last night against the average of the nights before it, in words.
  const periodAvg = periodNights.length > 0 ? periodSales / periodNights.length : 0;
  const vsAvgPct = periodAvg > 0 ? Math.round(((lastNightSales - periodAvg) / periodAvg) * 100) : null;
  // A report dated today is tonight's, not last night's, and the heading says so.
  const reportIsToday = !!lastNight && lastNight.report_date === localTodayIso();

  // Filter active items in-memory: include items where is_active is true OR null
  // (NULL means the column defaulted without being set, not that it was deactivated)
  const items = (inventoryItems ?? []).filter(
    (i) => (i as Record<string, unknown>).is_active !== false,
  );

  // rep_id was added by a migration — fetch it separately so a missing column
  // never breaks the main inventory query above.
  const repAssignMap = new Map<string, string>(); // item_id → rep_id
  let repAssignFailed = false;
  try {
    const { data: repRows, error: repRowsErr } = await supabase
      .from('inventory_items')
      .select('id, rep_id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .not('rep_id', 'is', null);
    repAssignFailed = !!repRowsErr;
    for (const r of repRows ?? []) {
      const row = r as { id: string; rep_id: string | null };
      if (row.rep_id) repAssignMap.set(row.id, row.rep_id);
    }
  } catch { repAssignFailed = true; /* rep_id column not yet in this database — skip reorder suggestions */ }

  // A query that errors returns `data: null`, which the `?? []` fallbacks turn
  // into an empty list, and an empty list reads as good news ("All items stocked
  // above par", "No recent activity"). Each section carries its own failure flag
  // and says so, instead of passing a failed read off as zero.
  const nightsFailed    = !!nightsErr;
  const inventoryFailed = !!itemsErr;
  const moversFailed    = !!(usageErr || posSalesErr || categoriesErr);
  const activityFailed  = !!(activityErr || ordersErr);
  const alertsFailed    = !!(employeesErr || repsErr || pendingErr || repAssignFailed);

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

  const itemsWithPar  = items.filter((i) => hasPar(i as RawItem));
  const lowStockItems = itemsWithPar
    .filter((i) => isBelowPar(i as RawItem))
    .sort((a, b) => parRatio(a as RawItem) - parRatio(b as RawItem));
  // No par levels set means "not configured", never "fully compliant".
  const parConfigured = itemsWithPar.length > 0;

  const pendingOrders = (pendingOrdersData ?? []).length;

  const EXCLUDED = new Set(['front door']);
  const unconfiguredEmployees = (employees ?? []).filter(
    (e) => !(e as { archived_at?: string | null }).archived_at
      && !EXCLUDED.has(e.name.toLowerCase()) && (!e.role || e.hourly_rate === null),
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
      shipmentId: l.shipment_id,
    })),
    30,
  );
  const unitById = new Map(items.map((i) => [i.id, ((i as { unit?: string | null }).unit ?? '').trim()]));
  const fastMovers = movers.slice(0, 5).map((m) => ({ id: m.itemId, name: m.name, qty: m.unitsMoved, unit: unitById.get(m.itemId) || 'units' }));

  // Reorder suggestions — use the separately-fetched repAssignMap
  const reorderItems = items.filter(
    (i) => isBelowPar(i as RawItem) && repAssignMap.has(i.id),
  );
  const reorderByRep = new Map<string, { rep: { id: string; name: string }; items: typeof reorderItems }>();
  for (const item of reorderItems) {
    const repId   = repAssignMap.get(item.id);
    const repName = repId ? repNameMap.get(repId) : undefined;
    if (!repId || !repName) continue;
    if (!reorderByRep.has(repId)) reorderByRep.set(repId, { rep: { id: repId, name: repName }, items: [] });
    reorderByRep.get(repId)!.items.push(item);
  }
  const reorderGroups = [...reorderByRep.values()].sort((a, b) => b.items.length - a.items.length);

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

  // Stock reorders live in the Stock card; only non-stock alerts stay here.
  const hasAlerts = unconfiguredEmployees.length > 0 || pendingOrders > 0 || alertsFailed;

  // Activity is people's actions plus rep orders, newest first. The orders used
  // to be appended after the first five stock logs, so the feed was out of order.
  const feed = [
    ...(recentActivity ?? []).map((l) => ({ kind: 'log' as const, at: l.logged_at as string, log: l })),
    ...(recentOrders ?? []).map((o) => ({ kind: 'order' as const, at: o.created_at as string, order: o })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  // Entries of the same kind logged in the same minute-bucket collapse into one
  // row ("6 spillage entries, 58m ago"); a batch recount is one event, not six.
  const feedRows: { key: string; at: string; entries: typeof feed }[] = [];
  for (const e of feed) {
    const kind = e.kind === 'log' ? e.log.reason : 'order';
    const key = `${kind}|${timeAgo(e.at)}`;
    const last = feedRows[feedRows.length - 1];
    if (last && last.key === key) last.entries.push(e);
    else feedRows.push({ key, at: e.at, entries: [e] });
  }
  const shownFeed = feedRows.slice(0, 4);

  // The night the cash belongs to, not whatever day the pay screen opens on. The
  // old ?tab=split link went through the legacy map and dropped the date.
  const cashTipsHref = lastNight
    ? `/app/payroll?view=day&date=${lastNight.report_date}`
    : '/app/payroll?view=day';
  const bannerShowing = !!lastNight && cashTipsMissing && bannerDismissedFor !== lastNight.report_date;

  const stockTone: Tone = !parConfigured ? 'info'
    : lowStockItems.length === 0 ? 'good' : lowStockItems.length <= 3 ? 'warn' : 'critical';
  const outOfStock = items.filter((i) => i.current_stock === 0).length;

  const statusChips = (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <StatusChip
        href="/app/inventory" icon={Scale} tone={stockTone} label="Stock"
        value={inventoryFailed ? 'Could not load' : parConfigured ? (lowStockItems.length === 0 ? 'All at par' : `${lowStockItems.length} below par`) : 'No par set'}
      />
      {/* Only when the banner is not already saying it. */}
      {cashTipsMissing && !bannerShowing && (
        <StatusChip href={cashTipsHref} icon={Banknote} tone="warn" label="Tips" value="Cash not entered" />
      )}
      {canSeeOpenRun(role) && (
        <StatusChip
          href={openRun ? `/app/payroll/review?startDate=${openRun.periodStart}&endDate=${openRun.periodEnd}` : '/app/payroll'}
          icon={Wallet} tone={!openRun ? 'good' : openRun.status === 'changes_requested' ? 'critical' : 'warn'} label="Pay run"
          value={!openRun ? 'Nothing waiting' : openRun.status === 'changes_requested' ? 'Sent back' : 'Awaiting approval'}
        />
      )}
    </ul>
  );


  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── 1. Header ──────────────────────────────────────────────────────── */}
      {/* The bar's name is already in the app header; repeating it here as the
          h1 wrapped to three lines on a phone and pushed the content off the
          first screen. */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{greeting()}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── 2. Data freshness ──────────────────────────────────────────────── */}
      {/* First, on every screen size. This replaces a hard-coded green
          "connected" pill that read org.pos_provider and ignored whether the
          feed was alive, and was hidden on phones. The strip below is driven by
          the real sync outcome and renders nothing for a bar with no agent. */}
      <SyncStatusStrip health={syncHealth} />

      {/* ── 3. Last night ──────────────────────────────────────────────────── */}
      <section aria-labelledby="last-night-heading">
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="last-night-heading" className="font-heading text-sm font-semibold tracking-tight">{reportIsToday ? 'Tonight' : 'Last night'}</h2>
              {lastNight && (
                <span className="text-sm text-muted-foreground">{fmtDate(lastNight.report_date as string)}{reportIsToday ? ' · report on file' : ''}</span>
              )}
            </div>

            {nightsFailed ? (
              <SectionError what="last night's sales" />
            ) : !lastNight ? (
              <p className="text-sm text-muted-foreground">
                No Z reports yet. <Link href="/app/settings?tab=import-data" className="text-primary underline underline-offset-2">Import Z reports</Link> to see last night here.
              </p>
            ) : (
              <>
                {reportIsOld && (
                  <p className="text-sm text-muted-foreground">
                    This is the most recent report on file, {daysSinceReport} days ago.
                  </p>
                )}

                {/* The banner below is the one place that says cash is missing and
                    the one action; the figures here stay quiet about it. */}
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="text-sm text-muted-foreground">Sales</dt>
                    <dd className="font-heading text-3xl font-bold tabular-nums leading-tight">{fmtMoney(lastNightSales)}</dd>
                    {/* A part night is not a bad night: no verdict until it closes. */}
                    {reportIsToday && periodAvg > 0 && (
                      <dd className="text-xs text-muted-foreground tabular-nums">Night in progress · average {fmtMoney(periodAvg)}</dd>
                    )}
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Tips</dt>
                    <dd className="font-heading text-3xl font-bold tabular-nums leading-tight">{fmtMoney(lastNightTips)}</dd>
                    <dd className="text-xs text-muted-foreground tabular-nums">
                      Card {fmtMoney(lastNight.cc_tips ?? 0)}{cashTipsMissing ? (bannerShowing ? '' : ' · no cash entered') : ` · Cash ${fmtMoney(lastNight.cash_tips ?? 0)}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground" title="Card plus cash tips, divided by sales.">Tip rate</dt>
                    <dd className={`flex flex-wrap items-center gap-x-2 font-heading text-3xl font-bold tabular-nums leading-tight ${cashTipsMissing ? 'text-muted-foreground' : ''}`}>
                      {lastNightSales > 0 ? `${lastNightTipPct.toFixed(1)}%` : '—'}
                      {cashTipsMissing && lastNightSales > 0 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs font-medium text-muted-foreground">provisional</span>
                      )}
                    </dd>
                    {tipBand && !cashTipsMissing && (
                      <dd className={`text-xs font-medium ${
                        tipBand === 'strong' ? 'text-emerald-700 dark:text-emerald-300'
                        : tipBand === 'fair' ? 'text-amber-800 dark:text-amber-300'
                        : 'text-red-700 dark:text-red-300'}`}
                      >
                        {tipBand === 'strong' ? 'Strong · 15% or more' : tipBand === 'fair' ? 'Fair · 12–15%' : 'Low · under 12%'}
                      </dd>
                    )}
                  </div>
                </dl>

                {statusChips}

                {bannerShowing && (
                  <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                    <p className="text-sm">
                      Cash tips aren&rsquo;t entered for this night, so the tip rate counts card tips only and every tip split is short by whatever is in the jar.
                    </p>
                    <div className="flex items-center gap-2 max-md:w-full md:shrink-0">
                      <form action={dismissCashTipsBanner}>
                        <input type="hidden" name="night" value={lastNight.report_date as string} />
                        <button type="submit" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground md:min-h-9">
                          Not tonight
                        </button>
                      </form>
                      <Link
                        href={cashTipsHref}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-cta px-3 text-sm font-semibold text-cta-foreground hover:opacity-90 md:min-h-9 md:flex-none"
                      >
                        <Banknote className="h-4 w-4" aria-hidden /> Log cash tips
                      </Link>
                    </div>
                  </div>
                )}

                {/* The verdict is for a closed night only. */}
                {!reportIsToday && vsAvgPct !== null && periodSales > 0 && (
                  <p className="border-t pt-3 text-sm text-muted-foreground tabular-nums">
                    <Link href="/app/sales" className="inline-flex min-h-11 items-center underline-offset-2 hover:underline">
                      <span>
                        Sales{' '}
                        {vsAvgPct === 0 ? (
                          'in line with'
                        ) : (
                          <>
                            <span className={`mx-0.5 inline-block rounded-md px-1.5 py-0.5 font-heading text-sm font-bold ${vsAvgPct > 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>
                              {Math.abs(vsAvgPct)}%
                            </span>{' '}
                            {vsAvgPct > 0 ? 'above' : 'below'}
                          </>
                        )}{' '}
                        the {fmtMoney(periodAvg)} average of the {periodNights.length} nights before
                      </span>
                    </Link>
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── 4. Needs your attention ────────────────────────────────────────── */}
      {/* Non-stock alerts only (staff setup, pending orders); reorders sit in Stock. */}
      {hasAlerts && (
        <section aria-labelledby="attention-heading" className="space-y-3">
          {/* The DESIGN.md amber section label, used AS the heading rather than
              stacked above another one. */}
          <h2 id="attention-heading" className="eyebrow">Needs your attention</h2>

          {alertsFailed && <SectionError what="some alerts (staff setup, reorders or pending orders)" />}

          <div className="space-y-2">
            {unconfiguredEmployees.length > 0 && (
              <AttentionLink
                href="/app/payroll?tab=employees" icon={Users} 
                title="Staff setup needed"
                detail={`${unconfiguredEmployees.length} employee${unconfiguredEmployees.length > 1 ? 's' : ''} missing role or hourly rate`}
              />
            )}
            {pendingOrders > 0 && (
              <AttentionLink
                href="/app/reps" icon={ShoppingCart} 
                title={`${pendingOrders} pending order${pendingOrders > 1 ? 's' : ''}`}
                detail="Awaiting delivery confirmation"
              />
            )}
          </div>
        </section>
      )}

      {/* ── 5. Stock and activity ──────────────────────────────────────────── */}
      {/* `min-w-0` on every column is load-bearing. A grid item defaults to
          min-width:auto, so it refuses to shrink below its widest content —
          these measured 345px inside a 282px grid on a 320px phone and
          dragged the whole page into horizontal scroll. */}
      {/* Two stacks on desktop (Stock + Revenue | Movers + Activity) so neither
          column leaves a gap; on a phone the wrappers vanish and `order` puts the
          chart straight after Stock. */}
      <div className="grid gap-5 lg:grid-cols-5">

        {/* One stock card. Low stock, par compliance, inventory value and the
            worst offenders were four separate cards describing one question:
            what do I need to order? */}
        <div className="min-w-0 max-lg:order-1 lg:col-span-3">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Scale className="h-4 w-4 text-muted-foreground" aria-hidden /> Stock
                </CardTitle>
                <Link href="/app/inventory/analytics" className="text-sm text-primary hover:underline inline-flex min-h-11 items-center gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  Analytics <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {inventoryFailed ? (
                <SectionError what="inventory" />
              ) : (
                <>
                  <Link href="/app/inventory" className="flex min-h-11 items-center gap-3 rounded-xl border bg-card p-3.5 transition-colors hover:bg-muted/40">
                    <span className={`shrink-0 rounded-xl p-2 ${TONE_CHIP.info}`}><Package className="h-4 w-4" aria-hidden /></span>
                    <span className="min-w-0">
                      <span className="block font-heading text-2xl font-bold tabular-nums leading-none">{fmtMoney(inventoryValue)}</span>
                      <span className="mt-1.5 block text-sm font-medium">Inventory value</span>
                      <span className="block text-xs text-muted-foreground">{items.length} items tracked{outOfStock > 0 ? ` · ${outOfStock} out` : ''}</span>
                    </span>
                  </Link>

                  {!parConfigured && (
                    <p className="text-sm text-muted-foreground">
                      No par levels are set, so there is nothing to compare stock against.{' '}
                      <Link href="/app/inventory/setup" className="text-primary underline underline-offset-2">Set par levels</Link>
                    </p>
                  )}

                  {parConfigured && lowStockItems.length > 0 && (
                    <div>
                      <h3 className="eyebrow">Furthest below par</h3>
                      <p className="text-xs text-muted-foreground">On hand / par, in stock units (bottles, cases, kegs)</p>
                      <details className="mb-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer py-3.5 text-primary md:py-1">What is par?</summary>
                        <p className="pb-1">Par is the amount you want on the shelf after a delivery. Below it, an item is due for reorder.</p>
                      </details>
                      <ul className="space-y-1">
                        {lowStockItems.slice(0, 5).map((item) => {
                          const par      = Number((item as RawItem).par_level ?? 0);
                          const pct      = parRatio(item as RawItem) * 100;
                          const critical = item.current_stock === 0;
                          const catId    = (item as RawItem).category_id;
                          const cat      = (catId ? catNameMap.get(catId) : undefined) ?? 'Uncategorized';
                          return (
                            <li key={item.id}>
                              <Link href={`/app/inventory?q=${encodeURIComponent(item.name)}`} className="flex min-h-11 items-center gap-3 py-1.5 rounded-md hover:bg-muted/60">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate leading-none">{item.name}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{cat}</p>
                                </div>
                                <div className="w-24 shrink-0">
                                  <div className="h-2.5 rounded-full bg-muted ring-1 ring-border overflow-hidden mb-1">
                                    <div className={`h-full rounded-full ${critical ? 'bg-red-600 dark:bg-red-400' : 'bg-amber-600 dark:bg-amber-400'}`} style={{ width: `${Math.max(pct, critical ? 0 : 3)}%` }} />
                                  </div>
                                  <p className={`text-xs tabular-nums text-right ${critical ? 'text-red-700 dark:text-red-300 font-semibold' : 'text-amber-800 dark:text-amber-300'}`}>
                                    {critical ? <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" aria-hidden />OUT</span> : `${item.current_stock} / ${par}`}
                                  </p>
                                </div>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                      {lowStockItems.length > 5 && (
                        <Link href="/app/inventory" className="text-sm text-primary hover:underline inline-flex min-h-11 items-center gap-1">
                          +{lowStockItems.length - 5} more below par <ChevronRight className="h-4 w-4" aria-hidden />
                        </Link>
                      )}
                    </div>
                  )}

                  {reorderGroups.length > 0 && (
                    <div>
                      <h3 className="eyebrow">Reorder</h3>
                      <ul className="mt-1 space-y-1">
                        {reorderGroups.slice(0, 4).map((g) => (
                          <li key={g.rep.id}>
                            <Link href={`/app/reps?order=${g.rep.id}`} className="flex min-h-11 items-center gap-3 rounded-md px-1 py-1.5 hover:bg-muted/60">
                              <span className="shrink-0 rounded-lg bg-muted p-1.5 text-muted-foreground"><RefreshCw className="h-4 w-4" aria-hidden /></span>
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">Reorder from {g.rep.name}</span>
                              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{g.items.length} {g.items.length === 1 ? 'item' : 'items'}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {reorderGroups.length > 4 && (
                        <Link href="/app/reps" className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline">
                          {reorderGroups.length - 4} more {reorderGroups.length - 4 === 1 ? 'rep' : 'reps'} <ChevronRight className="h-4 w-4" aria-hidden />
                        </Link>
                      )}
                    </div>
                  )}

                  {parConfigured && lowStockItems.length === 0 && (
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg px-3 py-2.5">
                      <CheckCircle className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="text-sm font-medium">All items stocked above par</span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>


        <div className="min-w-0 max-lg:order-2 lg:col-span-3 lg:row-start-2">
          {nightsFailed ? (
            <Card>
              <CardContent className="py-8"><SectionError what="the revenue trend" /></CardContent>
            </Card>
          ) : nightsData.length > 0 ? (
            <Card className="h-full">
              <CardHeader>
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <CardTitle className="text-sm font-semibold">Revenue trend — last {nightsData.length} nights</CardTitle>
                  <span className="flex items-center gap-3 whitespace-nowrap text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-1)' }} aria-hidden />Sales</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-3)' }} aria-hidden />Tips</span>
                    <span className="flex items-center gap-1"><span className="h-0.5 w-3" style={{ background: 'var(--chart-2)' }} aria-hidden />Tip % (right axis)</span>
                  </span>
                </div>
                {periodSales > 0 && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    The {periodNights.length} nights before {reportIsToday ? 'tonight' : 'last night'}: {fmtMoney(periodSales)} sales · {fmtMoney(periodTips)} tips
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <RevenueChart data={nightsData} />
                {/* The same figures as the chart, one night per row. Collapsed:
                    the chart already tells the story; open it only to read an
                    exact night. */}
                <details className="mt-3 border-t pt-2">
                  {/* Block, not flex: flex drops the browser's disclosure arrow, the
                      only cue that this row opens. py-3 plus the line is the 44px floor. */}
                  <summary className="cursor-pointer py-3 text-sm font-medium text-primary">
                    Show the last {nightsData.length} nights
                  </summary>
                  <div className="divide-y">
                    {nightsData.map((n) => (
                      // The four columns were fixed-width and shrink-0, totalling
                      // 388px inside a card that has 280px on a 320px phone, so the
                      // whole page scrolled sideways. The date now takes the slack
                      // and truncates; the figures keep fixed widths so they stay
                      // decimal-aligned, just narrower until there is room.
                      <div key={n.nightDate} className="flex items-center gap-2 py-2 text-sm sm:gap-3">
                        <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{fmtDate(n.nightDate)}</span>
                        <span className="font-medium tabular-nums w-20 text-right shrink-0 sm:w-24">{fmtMoney(n.totalSales)}</span>
                        <span className="tabular-nums w-16 text-right shrink-0 sm:w-20">{fmtMoney(n.totalTips)}</span>
                        <span className={`text-xs tabular-nums font-medium w-11 text-right shrink-0 sm:w-12 ${n.tipPercent >= 15 ? 'text-emerald-700 dark:text-emerald-300' : n.tipPercent >= 12 ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>
                          {n.tipPercent.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" aria-hidden />
                <p className="text-sm font-medium">No sales data yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Import Z Reports to see revenue trends</p>
                <Link href="/app/settings?tab=import-data" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors">
                  Import Z Reports
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Fast movers */}
        <div className="min-w-0 max-lg:order-3 lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" aria-hidden /> Top movers (30 days)
                </CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">Stock units moved: sold through the POS plus anything logged as lost.</p>
            </CardHeader>
            <CardContent>
              {moversFailed ? (
                <SectionError what="top movers" />
              ) : fastMovers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nothing has moved in the last 30 days. This counts what sold through
                  the POS plus anything logged as spilled or comped — not what is on
                  the shelf, so stock levels will not change it.
                </p>
              ) : (
                <ol className="space-y-3">
                  {fastMovers.map((item, i) => {
                    const max = fastMovers[0]?.qty ?? 1;
                    const pct = (item.qty / max) * 100;
                    return (
                      <li key={item.id}>
                       <Link href={`/app/inventory?q=${encodeURIComponent(item.name)}`} className="flex min-h-11 items-center gap-3 rounded-md hover:bg-muted/60">
                        <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate leading-none">{item.name}</p>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1.5">
                            <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="text-sm tabular-nums font-semibold text-primary shrink-0">
                          {item.qty.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">{item.unit}</span>
                        </span>
                       </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent activity */}
        <div className="min-w-0 max-lg:order-4 lg:col-span-2 lg:row-start-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" aria-hidden /> Recent activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              {activityFailed ? (
                <div className="px-4 pb-4"><SectionError what="recent activity" /></div>
              ) : feed.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8 px-4">No recent activity recorded</p>
              ) : (
                <ul className="divide-y">
                  {shownFeed.map((row) => {
                    const entry = row.entries[0];
                    const n = row.entries.length;
                    if (entry.kind === 'log') {
                      const { log } = entry;
                      const name   = n > 1 ? `${n} ${(REASON_LABEL[log.reason] ?? log.reason).toLowerCase()} entries` : (itemNameMap.get(log.item_id) ?? 'Unknown item');
                      const label  = REASON_LABEL[log.reason] ?? log.reason;
                      const qty    = Number(log.quantity);
                      const names  = row.entries.map((x) => x.kind === 'log' ? (itemNameMap.get(x.log.item_id) ?? 'Unknown item') : '');
                      return (
                        <li key={`log-${row.key}-${row.at}`}>
                        <Link href={n > 1 ? '/app/inventory' : `/app/inventory?q=${encodeURIComponent(name)}`} className="flex min-h-11 items-start gap-3 px-4 py-3 hover:bg-muted/60">
                          <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${'bg-muted text-muted-foreground'}`}>
                            <Package className="h-3.5 w-3.5" aria-hidden />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate leading-snug">{name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {n > 1
                                ? `${names.slice(0, 2).join(', ')}${n > 2 ? ` + ${n - 2} more` : ''}`
                                : `${label} · ${log.quantity} ${qty === 1 ? 'unit' : 'units'}`}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0 mt-0.5 whitespace-nowrap">
                            {timeAgo(row.at)}
                          </span>
                        </Link>
                        </li>
                      );
                    }
                    const { order } = entry;
                    const repName = repNameMap.get((order as Record<string, unknown>).rep_id as string) ?? 'Rep';
                    return (
                      <li key={`order-${row.key}-${order.id}`}>
                       <Link href="/app/reps" className="flex min-h-11 items-start gap-3 px-4 py-3 hover:bg-muted/60">
                        <div className="mt-0.5 p-1.5 rounded-lg bg-muted text-muted-foreground shrink-0">
                          <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate leading-snug">{n > 1 ? `${n} orders sent` : `Order to ${repName}`}</p>
                          <p className="text-xs text-muted-foreground capitalize">{n > 1 ? 'Recent rep orders' : order.status}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 mt-0.5 whitespace-nowrap">
                          {timeAgo(row.at)}
                        </span>
                       </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** A section whose read failed. Says so, instead of rendering as zero. */
function SectionError({ what }: { what: string }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-red-600/30 bg-red-600/5 px-3 py-2.5 text-sm text-red-800 dark:text-red-300">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span>Couldn&rsquo;t load {what}.</span>
      <Link href="/app/dashboard" className="font-medium underline underline-offset-2">Try again</Link>
    </div>
  );
}

function AttentionLink({ href, icon: Icon, title, detail, badge }: {
  href: string; icon: React.ComponentType<{ className?: string }>;
  title: string; detail: string; tone?: 'info'; badge?: string;
}) {
  return (
    <Link href={href} className="flex min-h-11 items-start gap-3 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:bg-muted/60 max-md:pr-16">
      <span className="mt-0.5 rounded-lg bg-muted p-1.5 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </span>
      {badge && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{badge}</span>}
    </Link>
  );
}

type Tone = 'good' | 'warn' | 'critical' | 'info';

// The DESIGN.md stat-card pattern: a tinted chip and a figure in the matching hue.
// Here the tint means something (red is a real shortfall, green is fine, blue is
// just information), so it is status, not decoration. All 800/300 steps clear 4.5:1.
const TONE_CHIP: Record<Tone, string> = {
  good:     'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  warn:     'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  info:     'bg-primary/10 text-primary',
};
const TONE_VALUE: Record<Tone, string> = {
  good:     'text-emerald-700 dark:text-emerald-300',
  warn:     'text-amber-800 dark:text-amber-300',
  critical: 'text-red-700 dark:text-red-300',
  info:     'text-foreground',
};

/** One tappable status in the row under the hero. The word carries the state; the tint only echoes it. */
function StatusChip({ href, icon: Icon, tone, label, value }: {
  href: string; icon: React.ComponentType<{ className?: string }>;
  tone: Tone; label: string; value: string;
}) {
  return (
    <li>
      <Link href={href} className="flex min-h-11 items-center gap-2.5 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-muted/60">
        <span className={`shrink-0 rounded-lg p-1.5 ${TONE_CHIP[tone]}`}><Icon className="h-4 w-4" aria-hidden /></span>
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">{label}</span>
          <span className={`block text-sm font-semibold ${TONE_VALUE[tone]}`}>{value}</span>
        </span>
      </Link>
    </li>
  );
}
