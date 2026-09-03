import { hasPack } from './packs';

/**
 * Expanding an invoice line from packs into singles, and folding it back.
 *
 * Pure — the shipment review dialog calls this so the arithmetic can be tested
 * without a browser.
 *
 * A delivery line carries BOTH a quantity and a unit cost, and the line total
 * is their product. Converting the quantity alone is the obvious mistake and a
 * loud one: 5 cases at $28.50 becoming 120 cans at $28.50 turns a $142.50 line
 * into $3,420, which then reconciles against the invoice total and reports a
 * $3,277 discrepancy the operator has to unpick.
 *
 * So the two move together. The bar paid what it paid; only the unit the figure
 * is expressed in changes.
 *
 * This is the ONE place pack size touches money, and it is deliberately at the
 * point of entry, under an explicit operator action, with the result on screen
 * before anything posts. Depletion, COGS and par comparison never see it.
 */

export type PackLine = {
  quantity: number;
  unitCost: number | null;
  unitsPerPack: number | null;
  packApplied: boolean;
};

export function togglePackLine<T extends PackLine>(line: T): T {
  if (!hasPack(line.unitsPerPack)) return line;

  const per = Number(line.unitsPerPack);
  const cost = line.unitCost;

  if (line.packApplied) {
    return {
      ...line,
      quantity: line.quantity / per,
      unitCost: cost === null ? null : cost * per,
      packApplied: false,
    };
  }
  return {
    ...line,
    quantity: line.quantity * per,
    unitCost: cost === null ? null : cost / per,
    packApplied: true,
  };
}

/** What the reconciliation panel sums. */
export function lineTotal(line: Pick<PackLine, 'quantity' | 'unitCost'>): number {
  return line.quantity * (line.unitCost ?? 0);
}
