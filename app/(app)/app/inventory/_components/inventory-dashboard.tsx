'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, TrendingDown, DollarSign, Truck, ShoppingCart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';

export type DashboardUsageLog = {
  item_id: string;
  quantity: number;
  reason: string;
  note: string | null;
  /** usage_logs stores this as `logged_at`, not `created_at`. */
  logged_at: string;
  inventory_items: { name: string } | null;
};

export type DashboardItem = {
  current_stock: number | null;
  cost_price: number | null;
};

type ChartEntry = { name: string; total: number };

const CHART_PRIMARY = '#c07830';
const CHART_LOSS = '#d84040';
const TICK_COLOR = '#666';
const TOOLTIP_STYLE = {
  background: '#1a1a1a',
  border: '1px solid #2e2e2e',
  borderRadius: '6px',
  fontSize: 12,
};
const TOOLTIP_TEXT = { color: '#e0e0e0' };

/**
 * InventoryDashboard displays an overview of inventory statistics, including top sellers,
 * biggest losses, total cost of products on hand, and details about the latest shipment.
 *
 * @param usageLogs - Array of usage log entries for inventory items.
 * @param items - Array of inventory items with current stock and cost price.
 */
export function InventoryDashboard({
  usageLogs,
  items,
}: {
  usageLogs: DashboardUsageLog[];
  items: DashboardItem[];
}) {
  const [open, setOpen] = useState(true);

  const topSellers = useMemo<ChartEntry[]>(() => {
    const map = new Map<string, ChartEntry>();
    for (const log of usageLogs) {
      if (log.reason === 'delivery' || log.reason === 'recount') continue;
      const name = log.inventory_items?.name ?? 'Unknown';
      const existing = map.get(log.item_id);
      if (existing) existing.total += log.quantity;
      else map.set(log.item_id, { name, total: log.quantity });
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [usageLogs]);

  const biggestLosses = useMemo<ChartEntry[]>(() => {
    const map = new Map<string, ChartEntry>();
    for (const log of usageLogs) {
      if (!['spillage', 'comp', 'staff_drink'].includes(log.reason)) continue;
      const name = log.inventory_items?.name ?? 'Unknown';
      const existing = map.get(log.item_id);
      if (existing) existing.total += log.quantity;
      else map.set(log.item_id, { name, total: log.quantity });
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [usageLogs]);

  function calculateTotalCost(items: DashboardItem[]): number {
    return items.reduce((sum, i) => sum + (i.current_stock ?? 0) * (i.cost_price ?? 0), 0);
  }

  const { totalCost, stockedItemCount } = useMemo(() => ({
    totalCost: calculateTotalCost(items),
    stockedItemCount: items.filter(i => (i.current_stock ?? 0) > 0).length,
  }), [items]);

  const { latestShipmentDate, latestShipmentItems } = useMemo(() => {
    const deliveries = usageLogs.filter(l => l.reason === 'delivery');
    if (deliveries.length === 0) return { latestShipmentDate: null, latestShipmentItems: [] };
    // Sort deliveries newest first to find the latest delivery day
    const sortedDeliveries = [...deliveries].sort((a, b) => b.logged_at.localeCompare(a.logged_at));
    const latestDay = sortedDeliveries[0].logged_at.slice(0, 10);
    const sameDay = sortedDeliveries.filter(l => l.logged_at.slice(0, 10) === latestDay);
    return {
      latestShipmentDate: sortedDeliveries[0].logged_at,
      latestShipmentItems: sameDay.map(l => ({
        name: l.inventory_items?.name ?? 'Unknown',
        quantity: l.quantity,
      })),
    };
  }, [usageLogs]);

  const TRUNCATE_LENGTH = 12;
  const truncate = (s: string, length: number = TRUNCATE_LENGTH) =>
    s.length > length ? s.slice(0, length) + '…' : s;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <span>Inventory Overview</span>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground" />
        }
      </button>

      {open && (
        <div className="border-t border-border px-4 pt-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Top Sellers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                Top Sellers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topSellers.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No usage data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={topSellers} layout="vertical" margin={{ left: 4, right: 20, top: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 11, fill: TICK_COLOR }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: TICK_COLOR }}
                      width={84}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={truncate}
                    />
                   

                    <Bar dataKey="total" fill={CHART_PRIMARY} radius={[0, 4, 4, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Biggest Losses */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                Biggest Losses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {biggestLosses.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No loss data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={biggestLosses} layout="vertical" margin={{ left: 4, right: 20, top: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 11, fill: TICK_COLOR }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: TICK_COLOR }}
                      width={84}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={truncate}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={TOOLTIP_TEXT}
                      itemStyle={TOOLTIP_TEXT}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      formatter={(value: any): any => [`${value ?? 0} units`, 'Lost']}
                    />
                    <Bar dataKey="total" fill={CHART_LOSS} radius={[0, 4, 4, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Cost of Product on Hand */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Cost of Product on Hand
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <p className="text-3xl font-bold tracking-tight">
                ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1.5">
                {stockedItemCount} item{stockedItemCount !== 1 ? 's' : ''} currently in stock
              </p>
            </CardContent>
          </Card>

          {/* Latest Shipment */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                Latest Shipment
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              {!latestShipmentDate ? (
                <p className="text-xs text-muted-foreground py-2">No deliveries recorded</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-2.5">
                    {format(new Date(latestShipmentDate), 'MMM d, yyyy')}
                  </p>
                  <ul className="space-y-2">
                    {latestShipmentItems.map((item) => (
                      <li key={`${item.name}-${item.quantity}`} className="flex justify-between items-center text-sm">
                        <span className="truncate">{item.name}</span>
                        <span className="text-muted-foreground ml-3 shrink-0 tabular-nums">+{item.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
}
