import { describe, it, expect } from 'vitest';
import { latestDelivery, type DeliveryLog, type ShipmentRef } from './latest-delivery';

const log = (o: Partial<DeliveryLog> & { name: string }): DeliveryLog => ({
  reason: 'delivery', quantity: 1, logged_at: '2026-11-24T10:00:00Z', shipment_id: null,
  inventory_items: { name: o.name }, ...o,
});
const ship = (id: string, voided = false): ShipmentRef => ({ id, voided });

describe('latestDelivery', () => {
  it('is null with no deliveries', () => {
    expect(latestDelivery([log({ name: 'x', reason: 'spillage' })], [])).toBeNull();
  });

  it('joins to the shipment by shipment_id even when the invoice was keyed days later', () => {
    const r = latestDelivery([log({ name: 'Vodka', shipment_id: 's1', logged_at: '2026-11-25T09:00:00Z' })], [ship('s1')]);
    expect(r).toMatchObject({ kind: 'shipment', shipmentId: 's1' });
  });

  it('ignores deliveries that belong to a voided shipment', () => {
    const r = latestDelivery(
      [log({ name: 'Voided item', shipment_id: 's1', logged_at: '2026-11-25T09:00:00Z' }),
       log({ name: 'Old manual', logged_at: '2026-11-20T09:00:00Z' })],
      [ship('s1', true)],
    );
    expect(r).toMatchObject({ kind: 'manual', items: [{ name: 'Old manual', quantity: 1 }] });
  });

  it('does not list manual deliveries as lines of a real shipment, nor vice versa', () => {
    const r = latestDelivery(
      [log({ name: 'Manual', logged_at: '2026-11-25T11:00:00Z' }),
       log({ name: 'Real', shipment_id: 's1', logged_at: '2026-11-25T10:00:00Z' })],
      [ship('s1')],
    );
    expect(r).toMatchObject({ kind: 'manual', items: [{ name: 'Manual', quantity: 1 }] });
  });

  it('when only a voided shipment exists there is no card', () => {
    expect(latestDelivery([log({ name: 'a', shipment_id: 's1' })], [ship('s1', true)])).toBeNull();
  });
});
