/**
 * The arithmetic that decides what a shipment cost.
 *
 * Pure — no database, no clock. Same reasoning as lib/payroll/tip-pool.ts: this
 * is money, it is the part worth testing directly, and the server action does
 * the I/O either side of it.
 */

import type { CostType } from '@/lib/books/cost-structure';

/** One line of an invoice, already priced. `lineTotal` is quantity × unit cost. */
export type ShipmentLine = { costType: CostType; lineTotal: number };

/** Invoice-level charges. Deposits are deliberately absent — see reconcileTotal. */
export type ShipmentCharges = { freight: number; tax: number; otherCharges: number };

/** A line value that can take a share of the charges. */
function usableValue(lineTotal: number): number {
  const v = Number(lineTotal);
  // Negative and unreadable values are dropped rather than summed: a negative
  // share would hand one line a credit funded by the others.
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Spreads invoice-level charges across the lines, by share of line value.
 *
 * Weighted rather than split evenly, and per line rather than per category,
 * because a case of napkins on a liquor invoice should not carry the same
 * freight as ten cases of spirits.
 *
 * `unallocated` is the part that could not be spread — an invoice with charges
 * but no lines, or whose lines are all worth zero. It is returned rather than
 * discarded so a caller can show it; money that vanishes silently understates
 * costs and there is nothing on screen to notice.
 */
export function allocateShipmentCharges(
  lines: ShipmentLine[],
  charges: ShipmentCharges,
): { byLine: number[]; unallocated: number } {
  const values = (lines ?? []).map((l) => usableValue(l?.lineTotal));
  const total = values.reduce((t, v) => t + v, 0);

  const chargeTotal =
    (Number(charges?.freight) || 0) +
    (Number(charges?.tax) || 0) +
    (Number(charges?.otherCharges) || 0);

  if (chargeTotal <= 0) {
    return { byLine: values.map(() => 0), unallocated: 0 };
  }

  // Nothing to weight by. Keeping the charge visible as unallocated beats
  // dividing by zero and writing NaN into the P&L.
  if (total <= 0) {
    return { byLine: values.map(() => 0), unallocated: chargeTotal };
  }

  const byLine = values.map((v) => (v / total) * chargeTotal);
  return { byLine, unallocated: 0 };
}

/**
 * How far a price may move before a human has to look at it.
 *
 * Not a rejection threshold — distributors really do raise prices, and a bar
 * that cannot record a rise has a worse problem than one that confirms it.
 */
export const PRICE_CHANGE_THRESHOLD = 0.10;

export type PriceChange = {
  /** The stored cost before this invoice. 0 when the item had none. */
  from: number;
  to: number;
  /** Signed: negative is a fall. 0 when there was nothing to compare against. */
  pctChange: number;
  needsConfirm: boolean;
};

/**
 * Which items this invoice would reprice, and which of those need confirming.
 *
 * Keyed by inventory item id. Lines with no matched item are skipped — a
 * not-yet-created item has no stored cost to compare against and simply takes
 * the invoice price.
 *
 * When one invoice lists the same item more than once at different prices — a
 * split line, or two drops on one document — the lines are collapsed into a
 * quantity-weighted average before comparing. Taking the last line would make
 * the new cost depend on the order the model happened to emit rows in, which is
 * not a basis for pricing anything.
 *
 * A large FALL is flagged as readily as a large rise: $45.00 mis-read as $4.50
 * is the characteristic failure of reading numbers off a page, and it is a
 * decrease.
 */
export function flagPriceChanges(
  lines: Array<{ itemId: string | null; quantity: number; unitCost: number | null }>,
  currentCosts: Map<string, number>,
  threshold: number = PRICE_CHANGE_THRESHOLD,
): Map<string, PriceChange> {
  const weighted = new Map<string, { qty: number; cost: number }>();

  for (const line of lines ?? []) {
    const itemId = line?.itemId;
    const unitCost = Number(line?.unitCost);
    // A line with no price says nothing about what the item costs. Treating it
    // as zero would wipe the stored cost and take pour cost to infinity.
    if (!itemId || line?.unitCost === null || !Number.isFinite(unitCost) || unitCost < 0) continue;

    // A zero or unreadable quantity still carries a price, so it is weighted as
    // one rather than dropped — otherwise a whole invoice of them averages to
    // nothing.
    const qty = Number(line?.quantity);
    const weight = Number.isFinite(qty) && qty > 0 ? qty : 1;

    const acc = weighted.get(itemId) ?? { qty: 0, cost: 0 };
    acc.qty += weight;
    acc.cost += weight * unitCost;
    weighted.set(itemId, acc);
  }

  const changes = new Map<string, PriceChange>();

  for (const [itemId, { qty, cost }] of weighted) {
    const to = cost / qty;
    const from = Number(currentCosts.get(itemId)) || 0;

    // No stored cost is not a 100% rise — there is nothing to have moved from.
    const pctChange = from > 0 ? (to - from) / from : 0;

    changes.set(itemId, {
      from,
      to,
      pctChange,
      needsConfirm: from > 0 && Math.abs(pctChange) > threshold,
    });
  }

  return changes;
}

/** A cent. Rounding across a dozen lines should not read as a discrepancy. */
const RECONCILE_TOLERANCE = 0.01;

/**
 * Line sum plus every charge INCLUDING deposits, against the stated total.
 *
 * Deposits are billed on the invoice, so they belong in this comparison even
 * though they are excluded from cost of sales. Those are two different
 * questions — "does this tie to the paper" and "what did the beer cost" — and
 * conflating them makes every deposit-bearing invoice read as short by exactly
 * the deposit.
 *
 * A null stated total means the invoice did not give one, or nobody typed it.
 * That is "nothing to check", not a mismatch of zero.
 */
export function reconcileTotal(
  lines: Array<{ lineTotal: number }>,
  charges: ShipmentCharges & { deposits: number },
  invoiceTotal: number | null,
): { computed: number; stated: number | null; difference: number; matches: boolean } {
  const lineSum = (lines ?? []).reduce((t, l) => {
    const v = Number(l?.lineTotal);
    return t + (Number.isFinite(v) ? v : 0);
  }, 0);

  const computed =
    lineSum +
    (Number(charges?.freight) || 0) +
    (Number(charges?.tax) || 0) +
    (Number(charges?.otherCharges) || 0) +
    (Number(charges?.deposits) || 0);

  const stated = Number.isFinite(Number(invoiceTotal)) && invoiceTotal !== null
    ? Number(invoiceTotal)
    : null;

  if (stated === null) return { computed, stated: null, difference: 0, matches: true };

  const difference = computed - stated;
  return {
    computed,
    stated,
    difference,
    matches: Math.abs(difference) <= RECONCILE_TOLERANCE,
  };
}
