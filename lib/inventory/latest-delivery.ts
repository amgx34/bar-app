export type DeliveryLog = {
  reason: string;
  quantity: number;
  logged_at: string;
  shipment_id: string | null;
  inventory_items: { name: string } | null;
};
export type ShipmentRef = { id: string; voided: boolean };

export type LatestDelivery =
  | { kind: 'shipment'; shipmentId: string; loggedAt: string }
  | { kind: 'manual'; loggedAt: string; items: { name: string; quantity: number }[] };

/**
 * What the "Latest Shipment" card shows. Delivery rows are tied to a shipment
 * document by `shipment_id` only, never by comparing dates (logged_at and
 * invoice_date are different clocks). Rows of a voided shipment are dropped;
 * rows with no shipment_id are manual or pre-shipments deliveries and are
 * grouped by the day they were logged, separately from any real shipment.
 */
export function latestDelivery(logs: DeliveryLog[], shipments: ShipmentRef[]): LatestDelivery | null {
  const voided = new Set(shipments.filter((s) => s.voided).map((s) => s.id));
  const rows = logs
    .filter((l) => l.reason === 'delivery' && !(l.shipment_id && voided.has(l.shipment_id)))
    .sort((a, b) => b.logged_at.localeCompare(a.logged_at));
  const newest = rows[0];
  if (!newest) return null;
  if (newest.shipment_id && shipments.some((s) => s.id === newest.shipment_id)) {
    return { kind: 'shipment', shipmentId: newest.shipment_id, loggedAt: newest.logged_at };
  }
  const day = newest.logged_at.slice(0, 10);
  return {
    kind: 'manual',
    loggedAt: newest.logged_at,
    items: rows
      .filter((l) => l.shipment_id === newest.shipment_id && l.logged_at.slice(0, 10) === day)
      .map((l) => ({ name: l.inventory_items?.name ?? 'Unknown', quantity: l.quantity })),
  };
}
