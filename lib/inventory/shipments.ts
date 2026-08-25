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
