/**
 * What an individual-mode or sales-percentage employee keeps from a night, taken
 * out BEFORE the barback cut and the pool are worked out.
 *
 * The Z total already contains every server's tips (the real Z in
 * Z_REPORT_SCHEMA.md: Tips Paid Out 1099.20, five per-server rows summing to
 * exactly 1099.20). Sharing the full total among the pool and then crediting these
 * employees on top paid out more than the night held — $1,596 against a Z total of
 * $1,212 for one night in the demo bar — and broke the rule the rest of payroll
 * states: the night reconciles against the Z report.
 *
 * Pure, so the conservation rule can be tested without a database.
 */

import { applyTipRemovals, type TipRemoval } from './adjustments';

export type ServerTipRow = {
  name: string;
  totalSales: number;
  tipsPaidOut: number;
};

export type Keeper = {
  employeeId: string;
  /** The name the POS uses for this person. Matched ignoring case and spacing. */
  name: string;
  mode: 'individual' | 'sales_pct';
};

export type KeptTipsInput = {
  /** The night's tips after unattributed removals: what is there to share. */
  dailyTips: number;
  serverTips: ServerTipRow[];
  keepers: Keeper[];
};

export type KeptTips = {
  /** employeeId -> tips they keep tonight. Empty when nobody keeps their own. */
  kept: Map<string, number>;
  /** What is left for the barback cut, the opener bonus and the pool. */
  remainder: number;
  /**
   * True when the carve-outs asked for more than the night held (bad data, such
   * as a server row typed wrong). They are scaled down to fit rather than
   * allocating money that does not exist, and the caller should surface this.
   */
  overAllocated: boolean;
};

const norm = (name: string) => name.trim().toLowerCase();

export function carveOutKeptTips(input: KeptTipsInput): KeptTips {
  const { dailyTips } = input;
  const kept = new Map<string, number>();
  const empty = { kept, remainder: dailyTips, overAllocated: false };
  if (!(dailyTips > 0) || input.keepers.length === 0 || input.serverTips.length === 0) return empty;

  const keeperByName = new Map(input.keepers.map((k) => [norm(k.name), k]));

  // Individual: exactly what the POS says they were paid out, summed over rows.
  const individual = new Map<string, number>();
  for (const row of input.serverTips) {
    const k = keeperByName.get(norm(row.name));
    if (!k || k.mode !== 'individual' || !(row.tipsPaidOut > 0)) continue;
    individual.set(k.employeeId, (individual.get(k.employeeId) ?? 0) + row.tipsPaidOut);
  }
  const individualTotal = [...individual.values()].reduce((s, v) => s + v, 0);

  // Over-allocated by individuals alone: scale to the night and stop.
  if (individualTotal > dailyTips) {
    const scale = dailyTips / individualTotal;
    for (const [id, v] of individual) kept.set(id, v * scale);
    return { kept, remainder: 0, overAllocated: true };
  }
  for (const [id, v] of individual) kept.set(id, v);

  // Sales percentage: a share of what individuals left, by sales among ALL the
  // night's server rows (so a pool server's sales still dilute it, as before).
  const afterIndividual = dailyTips - individualTotal;
  const totalDaySales = input.serverTips.reduce((s, r) => s + (r.totalSales > 0 ? r.totalSales : 0), 0);
  let salesPctTotal = 0;
  if (totalDaySales > 0) {
    for (const row of input.serverTips) {
      const k = keeperByName.get(norm(row.name));
      if (!k || k.mode !== 'sales_pct' || !(row.totalSales > 0)) continue;
      const share = (row.totalSales / totalDaySales) * afterIndividual;
      kept.set(k.employeeId, (kept.get(k.employeeId) ?? 0) + share);
      salesPctTotal += share;
    }
  }

  return { kept, remainder: afterIndividual - salesPctTotal, overAllocated: false };
}

export type NightForSharing = {
  /** Unattributed removals actually taken off the night (clamped to it). */
  removed: number;
  removalOverdrawn: boolean;
  kept: Map<string, number>;
  keptTotal: number;
  /** What is left for the barback cut, opener bonus and pool. */
  remainder: number;
  overAllocated: boolean;
};

/**
 * One night, in the pay run's order: unattributed tip removals first, then the
 * staff-kept carve-out. The day-split screen calls this so it cannot show a pool
 * the pay run does not pay.
 */
export function nightForSharing(input: {
  zTotalTips: number;
  removals: TipRemoval[];
  serverTips: ServerTipRow[];
  keepers: Keeper[];
}): NightForSharing {
  const rem = applyTipRemovals(input.zTotalTips, input.removals);
  const carve = carveOutKeptTips({
    dailyTips: rem.tipsAfterRemoval,
    serverTips: input.serverTips,
    keepers: input.keepers,
  });
  const keptTotal = [...carve.kept.values()].reduce((s, v) => s + v, 0);
  return {
    removed: rem.removed,
    removalOverdrawn: rem.overdrawn,
    kept: carve.kept,
    keptTotal,
    remainder: carve.remainder,
    overAllocated: carve.overAllocated,
  };
}
