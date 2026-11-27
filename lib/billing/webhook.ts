/** Pure decisions for the Stripe webhook; the route owns the I/O. */

/**
 * Stripe does not order deliveries, so an event older than the stored one must not overwrite it.
 * Compared as instants: Postgres returns timestamptz as `...+00:00`, which does not sort
 * against a `...Z` ISO string. An unparseable stored value is treated as absent.
 */
export function shouldApplyEvent(lastEventAt: string | null | undefined, eventCreatedSec: number): boolean {
  const last = lastEventAt ? Date.parse(lastEventAt) : NaN;
  return Number.isNaN(last) || last <= eventCreatedSec * 1000;
}

/** Org for a completed checkout: the subscription's own metadata wins, then client_reference_id. */
export function checkoutOrgId(subMetaOrg: string | undefined, clientRef: string | undefined): string | null {
  return subMetaOrg || clientRef || null;
}
