export type RankableLog = {
  item_id: string;
  quantity: number;
  reason: string;
  inventory_items: { name: string } | null;
};

export type RankEntry = { name: string; total: number };

/**
 * Top sellers = what the POS sold: pos_sale minus pos_reversal, in stock
 * units (usage_logs.quantity is already converted; no conversion here).
 * Spillage, comps, staff drinks and the rest are not sales.
 */
export function rankTopSellers(logs: RankableLog[]): RankEntry[] {
  const map = new Map<string, RankEntry>();
  for (const log of logs) {
    if (log.reason !== 'pos_sale' && log.reason !== 'pos_reversal') continue;
    const delta = log.reason === 'pos_sale' ? log.quantity : -log.quantity;
    const existing = map.get(log.item_id);
    if (existing) existing.total += delta;
    else map.set(log.item_id, { name: log.inventory_items?.name ?? 'Unknown', total: delta });
  }
  return Array.from(map.values())
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 5);
}
