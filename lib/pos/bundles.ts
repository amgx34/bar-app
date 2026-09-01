/**
 * Deals as recipes.
 *
 * A bundle is a POS line item that rings up as one thing but consumes several:
 * "Bucket of 5 Domestic", "Pitcher", "2-for-1 Well". Excluding it (see
 * `pos_excluded_items`) stops it polluting inventory, but throws away the fact
 * that five beers left the cooler. A bundle keeps that fact and spends it on the
 * right items.
 *
 * The resolution below is deliberately pure: no database, no clock. The ingest
 * route does the I/O either side of it, which is what makes the arithmetic —
 * the part that moves a bar's stock — testable on its own.
 */

import { posItemMatchKey } from './excluded-items';
import { componentUnits, unitsPerSale, type PourItem } from './pour';
import { parseVariant, buildTokenTable, type TokenTable } from './variants';

/** One line of the POS item audit, as the agent sends it. */
export type AuditRow = {
  sale_date: string;
  item_name: string;
  category_name: string;
  qty_sold: number;
  net_sales: number;
};

export type BundleComponent = {
  inventory_item_id: string;
  quantity: number;
  /**
   * 'each' = whole stock units. 'oz' = a measured pour, converted through the
   * component item's bottle size. Defaults to 'each' so recipes written before
   * pour tracking keep meaning exactly what they did.
   */
  unit?: 'each' | 'oz';
};

export type BundleRecipe = {
  match_key: string;
  components: BundleComponent[];
};

/** A row destined for `pos_item_sales` — what the POS said, before expansion. */
export type SalesFact = {
  sale_date: string;
  item_name: string;
  match_key: string;
  category_name: string | null;
  qty_sold: number;
  net_sales: number;
  is_bundle: boolean;
  /**
   * The item this line is really about, with any size token stripped — "DBL
   * TITO'S" reports "tito's". Equal to `match_key` when the name carries no
   * token, so a read can group by it unconditionally.
   */
  base_match_key: string;
  /** The size token found on the name, or null. */
  size_token: string | null;
};

export type ResolvedSales = {
  /** Raw POS facts, one per (day, item), duplicates summed. */
  facts: SalesFact[];
  /**
   * Total units to deduct, keyed by sale_date then inventory item id. Bundles
   * are already expanded and quantities for the same item summed, so a day that
   * sold a bucket of 5 and 3 loose bottles of the same beer yields one entry.
   */
  depletionByDate: Map<string, Map<string, number>>;
  /**
   * Match keys that resolved to a bundle. These must never be upserted into
   * `inventory_items` — that is the phantom-item problem this feature exists to
   * end.
   */
  bundleKeys: Set<string>;
  /**
   * Item names that are neither a bundle nor a known inventory item. Reported
   * rather than dropped silently: on a first sync this is simply everything,
   * but later it means a rename that broke a link.
   */
  unresolvedNames: string[];
};

/**
 * Resolves a batch of audit rows into sales facts and per-day depletion.
 *
 * `inventoryIdByMatchKey` maps a normalised item name to an inventory item id.
 * Callers build it from the org's own items — the same normalisation the
 * exclusion list uses, so "Bud Light" and "bud  light" are one item here too.
 */
/**
 * An inventory item, with everything needed to convert a sale into stock.
 *
 * Carries the category default so the pour can be resolved without a second
 * lookup per row — this runs over every item-audit line on every sync.
 */
export type InventoryRef = PourItem & {
  id: string;
  categoryPourOz: number | null;
};

export function resolveSales(
  rows: AuditRow[],
  bundles: BundleRecipe[],
  inventoryByMatchKey: Map<string, InventoryRef>,
  orgPourOz: number | null = null,
  tokens: TokenTable = buildTokenTable(),
): ResolvedSales {
  // Components reference items by id, direct sales by name.
  const byId = new Map<string, InventoryRef>();
  for (const ref of inventoryByMatchKey.values()) byId.set(ref.id, ref);

  const recipeByKey = new Map(bundles.map((b) => [b.match_key, b]));

  const factByKey = new Map<string, SalesFact>();
  const depletionByDate = new Map<string, Map<string, number>>();
  const bundleKeys = new Set<string>();
  const unresolved = new Set<string>();

  for (const row of rows) {
    const name = row.item_name?.trim();
    if (!name || !row.sale_date) continue;

    const matchKey = posItemMatchKey(name);
    const qty = Number(row.qty_sold) || 0;
    const net = Number(row.net_sales) || 0;

    // "DBL TITO'S" is two ounces of the item inventory calls "Tito's". The
    // parse travels with the fact so the sales report can roll the sizes up
    // without re-deriving it, and so it cannot disagree with what was deducted.
    const variant = parseVariant(name, tokens);

    // The agent already groups by (day, item), but a POS that spells the same
    // item two ways collapses to one key here — so sum rather than overwrite.
    const factKey = `${row.sale_date}|${matchKey}`;
    const existing = factByKey.get(factKey);
    if (existing) {
      existing.qty_sold += qty;
      existing.net_sales += net;
    } else {
      factByKey.set(factKey, {
        sale_date: row.sale_date,
        item_name: name,
        match_key: matchKey,
        category_name: row.category_name?.trim() || null,
        qty_sold: qty,
        net_sales: net,
        is_bundle: recipeByKey.has(matchKey),
        base_match_key: variant.baseMatchKey,
        size_token: variant.sizeToken,
      });
    }

    // Zero- and negative-quantity lines carry no depletion. A negative line is
    // a POS void; it is kept in the facts (revenue is genuinely negative) but
    // must not hand stock back here, because the applied-quantity ledger in
    // pos_apply_item_sales already handles restatement.
    if (qty <= 0) continue;

    const recipe = recipeByKey.get(matchKey);
    let dayMap = depletionByDate.get(row.sale_date);
    if (!dayMap) {
      dayMap = new Map<string, number>();
      depletionByDate.set(row.sale_date, dayMap);
    }

    if (recipe) {
      bundleKeys.add(matchKey);
      for (const component of recipe.components) {
        const componentItem = byId.get(component.inventory_item_id);
        // An 'oz' component needs the item's bottle size to mean anything, and
        // componentUnits returns 0 rather than guessing when it is missing.
        const perSale = componentUnits(
          component.quantity,
          component.unit ?? 'each',
          componentItem ?? { bottleSizeMl: null, pourSizeOz: null },
        );
        const units = perSale * qty;
        if (units === 0) continue;
        dayMap.set(
          component.inventory_item_id,
          (dayMap.get(component.inventory_item_id) ?? 0) + units,
        );
      }
      continue;
    }

    // A size variant resolves to its BASE item, and the base wins over an exact
    // match on the variant name. That order matters: every install that has been
    // syncing already has an auto-created phantom "DBL TITO'S" inventory row
    // sitting on the exact key, so preferring the exact match would make this
    // whole feature a no-op precisely where it is needed.
    //
    // The exact key is still the fallback, so a bar that genuinely stocks the
    // variant as its own item — and any name that does not parse — behaves
    // exactly as it did before.
    const baseItem = variant.sizeToken
      ? inventoryByMatchKey.get(variant.baseMatchKey)
      : undefined;
    const item = baseItem ?? inventoryByMatchKey.get(matchKey);
    if (!item) {
      unresolved.add(name);
      continue;
    }

    // Only when we actually resolved through the base. Applying it to an exact
    // match would double-count: that item's own pour size already describes it.
    const sizeMultiplier = baseItem ? variant.multiplier : 1;

    // The conversion that stops 185 shots removing 185 bottles. Items not sold
    // by the pour return a factor of 1 and behave exactly as before.
    const units = qty * sizeMultiplier * unitsPerSale(item, {
      categoryPourOz: item.categoryPourOz,
      orgPourOz,
    });
    dayMap.set(item.id, (dayMap.get(item.id) ?? 0) + units);
  }

  // A day whose every line was a void or an unknown item leaves an empty map;
  // dropping it here saves the route a pointless round trip per day.
  for (const [date, dayMap] of depletionByDate) {
    if (dayMap.size === 0) depletionByDate.delete(date);
  }

  return {
    facts: [...factByKey.values()],
    depletionByDate,
    bundleKeys,
    unresolvedNames: [...unresolved].sort(),
  };
}

/** Shapes a day's resolved quantities for the `pos_apply_item_sales` RPC. */
export function toRpcComponents(
  dayMap: Map<string, number>,
): { item_id: string; qty: number }[] {
  return [...dayMap.entries()].map(([item_id, qty]) => ({
    item_id,
    // Guards against float drift accumulating across many bundle expansions —
    // 0.1 * 3 is 0.30000000000000004, and that would make a re-sent day look
    // like a change and log a phantom movement every five minutes.
    qty: Math.round(qty * 10000) / 10000,
  }));
}
