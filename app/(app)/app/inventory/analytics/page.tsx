import type { Metadata } from 'next';
import dynamicImport from 'next/dynamic';
import Link from 'next/link';
import { TrendingUp, Package, AlertTriangle, DollarSign, Zap, Turtle, ShoppingCart, Scale, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAnalyticsData } from './actions';
import { getDealsAnalytics } from './deals-actions';
import { DealsPanel } from './_components/deals-panel';
import type { AlertItem } from './actions';
import { InventoryNav } from '../_components/inventory-nav';

export const dynamic = 'force-dynamic';

const CategoryValuePie     = dynamicImport(() => import('./_components/analytics-charts').then((m) => ({ default: m.CategoryValuePie })));
const FastMoversChart      = dynamicImport(() => import('./_components/analytics-charts').then((m) => ({ default: m.FastMoversChart })));
const TopValueChart        = dynamicImport(() => import('./_components/analytics-charts').then((m) => ({ default: m.TopValueChart })));
const ShrinkagePie         = dynamicImport(() => import('./_components/analytics-charts').then((m) => ({ default: m.ShrinkagePie })));
const MonthlyShrinkageChart = dynamicImport(() => import('./_components/analytics-charts').then((m) => ({ default: m.MonthlyShrinkageChart })));
const PourCostChart        = dynamicImport(() => import('./_components/analytics-charts').then((m) => ({ default: m.PourCostChart })));

const fmtMoney   = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtPct     = (n: number) => `${n.toFixed(1)}%`;
const fmtDecimal = (n: number) => n.toFixed(3);

const URGENCY_COLOR: Record<AlertItem['urgency'], string> = {
  critical: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200',
  high:     'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200',
  medium:   'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 border-yellow-200',
};
const URGENCY_LABEL: Record<AlertItem['urgency'], string> = { critical: 'OUT', high: '< 3 days', medium: 'Low' };

export const metadata: Metadata = { title: 'Inventory Analytics' };

export default async function InventoryAnalyticsPage() {
  // Independent queries, so they run together rather than one after the other.
  const [data, deals] = await Promise.all([getAnalyticsData(), getDealsAnalytics()]);

  const kpis = [
    { label: 'Inventory Value', value: fmtMoney(data.totalInventoryValue), sub: `${data.totalActiveItems} active items`, icon: Package, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Par Compliance',  value: fmtPct(data.parCompliancePct), sub: `${data.lowStockCount} below par · ${data.outOfStockCount} out`, icon: Scale, color: data.parCompliancePct >= 80 ? 'text-emerald-600' : data.parCompliancePct >= 60 ? 'text-amber-600' : 'text-destructive', bg: data.parCompliancePct >= 80 ? 'bg-emerald-100 dark:bg-emerald-900/40' : data.parCompliancePct >= 60 ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-red-100 dark:bg-red-900/40' },
    { label: 'Shrinkage (30d)', value: fmtMoney(data.totalShrinkageCost30d), sub: 'spillage + comps + staff', icon: AlertTriangle, color: 'text-rose-600', bg: 'bg-rose-100 dark:bg-rose-900/40' },
    { label: 'Avg Pour Cost',   value: data.avgPourCost > 0 ? `$${fmtDecimal(data.avgPourCost)}` : '—', sub: `across ${data.pourCosts.length} spirit SKUs`, icon: DollarSign, color: 'text-violet-600', bg: 'bg-violet-100 dark:bg-violet-900/40' },
  ];

  return (
    <main className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <p className="text-sm text-muted-foreground">Inventory</p>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" /> Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Last 30-day velocity · 90-day shrinkage · current snapshot</p>
      </div>

      <InventoryNav />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                    <p className={`text-xl sm:text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{kpi.sub}</p>
                  </div>
                  <div className={`p-2 rounded-lg shrink-0 ${kpi.bg}`}><Icon className={`h-4 w-4 ${kpi.color}`} /></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Deals sit directly under the KPIs rather than at the foot of the page.
          A deal is a pricing decision the operator can change tomorrow, which
          makes it more actionable than most of what follows — and it was
          previously invisible outside a settings tab. */}
      <DealsPanel data={deals} />

      {/* Category Value + Fast Movers */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        <Card className="md:col-span-1 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Value by Category</CardTitle>
            <p className="text-xs text-muted-foreground">Current stock × cost price</p>
          </CardHeader>
          <CardContent>
            <CategoryValuePie data={data.categoryBreakdown} />
            {/* Bar breakdown — sits below the chart at all sizes */}
            <div className="mt-4 space-y-2">
              {data.categoryBreakdown.slice(0, 6).map((cat, i) => (
                <div key={cat.category} className="flex items-center gap-2 text-xs">
                  {/* Colour dot */}
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: ['#0d9488','#f59e0b','#10b981','#0ea5e9','#8b5cf6','#e11d48'][i % 6] }}
                  />
                  {/* Label — grows but stays in a sensible range */}
                  <span className="text-muted-foreground truncate min-w-0 flex-1">
                    {cat.category}
                  </span>
                  {/* Bar */}
                  <div className="w-16 sm:w-24 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                    <div
                      className="h-full bg-primary/70 rounded-full"
                      style={{ width: `${data.totalInventoryValue > 0 ? (cat.totalValue / data.totalInventoryValue) * 100 : 0}%` }}
                    />
                  </div>
                  {/* Value */}
                  <span className="font-medium tabular-nums shrink-0 text-right min-w-[3.5rem]">
                    {fmtMoney(cat.totalValue)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="md:col-span-1 lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-amber-500" /><CardTitle className="text-sm font-semibold">Fast Movers</CardTitle></div>
            <p className="text-xs text-muted-foreground">
              Fastest moving over 30 days — POS sales plus logged losses. Stock on hand is not part of it.
            </p>
          </CardHeader>
          <CardContent><FastMoversChart data={data.fastMovers} /></CardContent>
        </Card>
      </div>

      {/* Predictive Alerts + Par Compliance */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><CardTitle className="text-sm font-semibold">Stock Alerts</CardTitle></div>
              <Link href="/app/inventory" className="text-xs text-primary hover:underline flex items-center gap-1">View inventory <ArrowRight className="h-3 w-3" /></Link>
            </div>
            <p className="text-xs text-muted-foreground">Predictive reorder recommendations</p>
          </CardHeader>
          <CardContent className="p-0">
            {data.predictiveAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">All items are well-stocked</p>
            ) : (
              <div className="divide-y">
                {data.predictiveAlerts.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.currentStock} in stock{item.daysRemaining !== null ? ` · ~${item.daysRemaining}d left` : ''}{item.suggestedReorder > 0 ? ` · reorder ${Math.ceil(item.suggestedReorder)}` : ''}</p>
                    </div>
                    <Badge className={`text-xs shrink-0 border ${URGENCY_COLOR[item.urgency]}`}>{URGENCY_LABEL[item.urgency]}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-primary" /><CardTitle className="text-sm font-semibold">Par Compliance by Category</CardTitle></div>
            <p className="text-xs text-muted-foreground">Items at or above par level</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.categoryBreakdown.filter((c) => c.itemCount > 0).map((cat) => {
                const pct = cat.itemCount > 0 ? ((cat.itemCount - cat.lowCount) / cat.itemCount) * 100 : 100;
                const color = pct === 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-400' : 'bg-red-500';
                return (
                  <div key={cat.category} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium truncate max-w-[160px]">{cat.category}</span>
                      <span className={`font-semibold ${pct === 100 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-destructive'}`}>{fmtPct(pct)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden"><div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} /></div>
                    <p className="text-xs text-muted-foreground">{cat.itemCount - cat.lowCount} / {cat.itemCount} items · {cat.lowCount > 0 ? `${cat.lowCount} low` : 'all good'}</p>
                  </div>
                );
              })}
              {data.categoryBreakdown.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No categories found</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Shrinkage */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Shrinkage by Reason</CardTitle><p className="text-xs text-muted-foreground">Last 90 days — estimated cost</p></CardHeader>
          <CardContent>
            <ShrinkagePie data={data.shrinkageByReason} />
            {data.shrinkageByReason.length > 0 && (
              <div className="mt-3 space-y-2">
                {data.shrinkageByReason.map((r) => (
                  <div key={r.reason} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{r.reason}</span>
                    <div className="flex gap-3"><span className="tabular-nums">{r.quantity.toFixed(1)} units</span><span className="font-medium tabular-nums">{fmtMoney(r.estimatedCost)}</span></div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Monthly Shrinkage Trend</CardTitle><p className="text-xs text-muted-foreground">Last 90 days — estimated cost</p></CardHeader>
          <CardContent><MonthlyShrinkageChart data={data.monthlyShrinkage} /></CardContent>
        </Card>
      </div>

      {/* Slow Movers */}
      {data.slowMovers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2"><Turtle className="h-4 w-4 text-muted-foreground" /><CardTitle className="text-sm font-semibold">Slow Movers</CardTitle></div>
            <p className="text-xs text-muted-foreground">Zero usage in last 30 days — consider reducing par or returning to rep</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x">
              {data.slowMovers.map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.category}</p>
                  <p className="text-xs mt-1"><span className="font-semibold text-amber-600">{item.currentStock}</span><span className="text-muted-foreground"> in stock</span></p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Value + Pour Cost */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top 10 — Highest Stock Value</CardTitle><p className="text-xs text-muted-foreground">Current units × cost price</p></CardHeader>
        <CardContent><TopValueChart data={data.topValueItems} /></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2"><Scale className="h-4 w-4 text-primary" /><CardTitle className="text-sm font-semibold">Pour Cost Analysis — Spirits</CardTitle></div>
          <p className="text-xs text-muted-foreground">Cost per standard pour by SKU. Set bottle size + pour size on inventory items to populate.</p>
        </CardHeader>
        <CardContent>
          <PourCostChart data={data.pourCosts} />
          {data.pourCosts.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-muted-foreground border-b"><th className="text-left py-1.5 font-medium">Item</th><th className="text-right py-1.5 font-medium">Bottle</th><th className="text-right py-1.5 font-medium">Pour</th><th className="text-right py-1.5 font-medium">$/oz</th><th className="text-right py-1.5 font-medium">$/pour</th></tr></thead>
                <tbody>
                  {data.pourCosts.map((p) => (
                    <tr key={p.name} className="border-b last:border-0">
                      <td className="py-1.5 font-medium max-w-[180px] truncate">{p.name}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{p.bottleSizeMl}ml</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{p.pourSizeOz}oz</td>
                      <td className="py-1.5 text-right tabular-nums">${p.costPerOz.toFixed(3)}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold text-violet-600">${p.costPerPour.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
