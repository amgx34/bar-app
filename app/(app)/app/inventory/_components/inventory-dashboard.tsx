'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, TrendingDown, DollarSign, Truck, ShoppingCart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import type { ShipmentSummary } from '../shipment-actions';

export type DashboardUsageLog = {
  item_id: string;
  quantity: number;
  reason: string;
  note: string | null;
  /** usage_logs stores this as `logged_at`, not `created_at`. */
  logged_at: string;
  /**
   * Non-null only for rows postShipment wrote — names the shipment this
   * delivery line belongs to. This is the ONLY reliable link back to a real
   * shipment document: `logged_at` is insertion time, not the invoice date,
   * so it must never be compared against `ShipmentSummary.invoiceDate`.
   */
  shipment_id: string | null;
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
 * Quantities are NUMERIC in the database and summed in JS, so three 0.1 pours
 * arrive as 0.30000000000000004. Printing that raw is how a tidy list turns
 * into line noise. Two decimals is past anything a bar counts, and trailing
 * zeros are dropped so whole units stay whole.
 */
function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 100) / 100);
}

/**
 * The same ranking as a list, for phones.
 *
 * A horizontal bar chart cannot show "Grey Goose Vodka 750ml" in a 290px
 * card: a 140px name gutter leaves nothing for the bars, and Recharts
 * responds by clipping the ticks to "Gre…" and "Ti…", which is exactly the
 * unreadable-names problem the wider axis was meant to fix. A list gives the
 * name the full width and keeps the comparison via a proportional bar.
 */
function RankedList({ entries, tone }: { entries: ChartEntry[]; tone: string }) {
  const max = Math.max(...entries.map((e) => e.total), 1);
  return (
    <ul className="space-y-2.5">
      {entries.map((entry) => (
        <li key={entry.name} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{entry.name}</span>
            <span className="shrink-0 tabular-nums font-medium">{fmtQty(entry.total)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${(entry.total / max) * 100}%`, background: tone }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * InventoryDashboard displays an overview of inventory statistics, including top sellers,
 * biggest losses, total cost of products on hand, and details about the latest shipment.
 *
 * @param usageLogs - Array of usage log entries for inventory items.
 * @param items - Array of inventory items with current stock and cost price.
 * @param shipments - Logged shipment documents (Task 5+), newest invoice
 *   date first. Used only to upgrade the "Latest Shipment" panel from an
 *   inference to the real vendor/total when one is available for that day —
 *   see the comment on `latestRealShipment` below.
 */
export function InventoryDashboard({
  usageLogs,
  items,
  shipments,
}: {
  usageLogs: DashboardUsageLog[];
  items: DashboardItem[];
  shipments: ShipmentSummary[];
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

  const { latestShipmentDate, latestShipmentItems, latestDayShipmentIds } = useMemo(() => {
    const deliveries = usageLogs.filter(l => l.reason === 'delivery');
    if (deliveries.length === 0) {
      return {
        latestShipmentDate: null,
        latestShipmentItems: [] as { name: string; quantity: number }[],
        latestDayShipmentIds: [] as string[],
      };
    }
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
      // Distinct shipment_id values named by this same day's delivery rows.
      // Not used by the inference render path itself (that still only reads
      // latestShipmentDate/latestShipmentItems, untouched above) — it exists
      // purely to hand latestRealShipment below something to match on that
      // isn't a date.
      latestDayShipmentIds: Array.from(
        new Set(sameDay.map(l => l.shipment_id).filter((id): id is string => id !== null)),
      ),
    };
  }, [usageLogs]);

  // The grouped-by-day block above is an INFERENCE: before shipments were
  // logged as their own documents, "the latest shipment" was just a guess
  // built from usage_logs rows that happen to carry reason: 'delivery'. It
  // has no vendor and no real invoice total, and it stays completely
  // unchanged above so a bar that never logs a shipment — every delivery
  // predating this feature, and any manual stock adjustment — keeps seeing
  // exactly what it always has.
  //
  // When the org DOES log shipments, prefer the real document instead of a
  // reconstruction — but matched by shipment_id, NOT by comparing dates.
  // logged_at (when the delivery row was inserted) and invoice_date (the
  // date printed on the vendor's invoice) are two different clocks: nothing
  // copies one into the other, and a bar keying in yesterday's — or last
  // week's — invoice is the normal case, not an edge case. Comparing dates
  // here silently misses every one of those and quietly falls back to the
  // inference with no indication why. usage_logs rows written by
  // postShipment already carry shipment_id, which names the real document
  // directly regardless of when it was typed in, so that is the only thing
  // compared below.
  //
  // Voided shipments are excluded: their stock was reversed and their money
  // excluded from the books (see voidShipment in shipment-actions.ts), so
  // presenting one as "the latest shipment" — with a vendor and a total that
  // no longer count — would contradict both. `shipments` is iterated in its
  // given order (listShipments returns newest invoice_date first) and the
  // first non-voided match wins — deterministic even on the rare day two
  // shipments were both logged: it prefers whichever has the later invoice
  // date, not whichever happened to sort first among usage_logs rows.
  const latestRealShipment = useMemo(() => {
    if (latestDayShipmentIds.length === 0) return null;
    for (const shipment of shipments) {
      if (!shipment.voided && latestDayShipmentIds.includes(shipment.id)) return shipment;
    }
    return null;
  }, [shipments, latestDayShipmentIds]);

  /**
   * `invoiceDate` is YYYY-MM-DD with no time component. `new Date(iso)` reads
   * that as UTC midnight, which prints as the day *before* in any timezone
   * west of UTC — the same pitfall documented on the identical helper in
   * shipments/_components/shipment-list.tsx. Splitting it out and building a
   * local date sidesteps that entirely.
   */
  function formatInvoiceDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return format(new Date(y, m - 1, d), 'MMM d, yyyy');
  }

  // 12 characters in an 84px gutter cut almost every real bottle name down to
  // something unreadable — "Tito's Handmade Vodka" arrived as "Tito's Handm…",
  // and two Jameson expressions were indistinguishable. The axis is wider and
  // the cut later; the tooltip carries the untruncated name for the rest.
  const AXIS_WIDTH = 140;
  const TRUNCATE_LENGTH = 22;
  const truncate = (s: string, length: number = TRUNCATE_LENGTH) =>
    s.length > length ? s.slice(0, length - 1).trimEnd() + '…' : s;

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
                <>
                <div className="sm:hidden">
                  <RankedList entries={topSellers} tone={CHART_PRIMARY} />
                </div>
                <ResponsiveContainer width="100%" height={160} className="hidden sm:block">
                  <BarChart data={topSellers} layout="vertical" margin={{ left: 4, right: 20, top: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 11, fill: TICK_COLOR }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: TICK_COLOR }}
                      width={AXIS_WIDTH}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={truncate}
                    />
                    {/* The label is the full item name — the axis is the only
                        place it gets shortened, so hovering always resolves it. */}
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={TOOLTIP_TEXT}
                      itemStyle={TOOLTIP_TEXT}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      formatter={(value) => [`${fmtQty(Number(value ?? 0))} units`, 'Sold'] as [string, string]}
                    />
                    <Bar dataKey="total" fill={CHART_PRIMARY} radius={[0, 4, 4, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
                </>
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
                <>
                <div className="sm:hidden">
                  <RankedList entries={biggestLosses} tone={CHART_LOSS} />
                </div>
                <ResponsiveContainer width="100%" height={160} className="hidden sm:block">
                  <BarChart data={biggestLosses} layout="vertical" margin={{ left: 4, right: 20, top: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 11, fill: TICK_COLOR }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: TICK_COLOR }}
                      width={AXIS_WIDTH}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={truncate}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={TOOLTIP_TEXT}
                      itemStyle={TOOLTIP_TEXT}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      formatter={(value) => [`${fmtQty(Number(value ?? 0))} units`, 'Lost'] as [string, string]}
                    />
                    <Bar dataKey="total" fill={CHART_LOSS} radius={[0, 4, 4, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
                </>
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
              ) : latestRealShipment ? (
                // A real shipment document exists for this day — show what it
                // actually says (vendor, invoice total) instead of the
                // reconstruction below. invoiceTotal is the number on the
                // paper invoice when one was entered; computedTotal (line
                // sum + freight/tax/other/deposits) is the fallback when it
                // wasn't, so the card never has nothing to show.
                <>
                  <p className="text-xs text-muted-foreground mb-2.5">
                    {formatInvoiceDate(latestRealShipment.invoiceDate)}
                  </p>
                  <p className="text-sm font-medium truncate">{latestRealShipment.vendorName}</p>
                  {latestRealShipment.invoiceNumber && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Invoice #{latestRealShipment.invoiceNumber}
                    </p>
                  )}
                  <p className="text-2xl font-bold tracking-tight tabular-nums mt-2">
                    ${(latestRealShipment.invoiceTotal ?? latestRealShipment.computedTotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {latestRealShipment.lineCount} item{latestRealShipment.lineCount !== 1 ? 's' : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-2.5">
                    {format(new Date(latestShipmentDate), 'MMM d, yyyy')}
                  </p>
                  <ul className="space-y-2">
                    {latestShipmentItems.map((item) => (
                      <li key={`${item.name}-${item.quantity}`} className="flex justify-between items-center text-sm">
                        <span className="truncate">{item.name}</span>
                        <span className="text-muted-foreground ml-3 shrink-0 tabular-nums">+{fmtQty(item.quantity)}</span>
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
