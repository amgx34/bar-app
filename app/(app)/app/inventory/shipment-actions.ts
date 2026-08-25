'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser, getCurrentOrg } from '@/lib/org';
import { canEditInventory } from '@/lib/permissions';
import { parseShipmentWithAI } from '@/lib/ai-parsers/parse-shipment-with-ai';

/**
 * Parse, post and void a supplier shipment.
 *
 * A shipment LINE is a usage_logs delivery row — see the comment at the top of
 * supabase/migrations/20260824000000_add_inventory_shipments.sql. There is no
 * separate line-items table: inventory_shipments is just the invoice-level
 * header, and posting it writes one usage_logs row per line, linked back by
 * shipment_id. Voiding walks that same link to reverse the stock.
 *
 * Every dollar figure in this file is STOCK-unit money — the same units as
 * inventory_items.cost_price. A case of beer costs what the invoice says per
 * case; nothing here ever touches a drink/POS price.
 *
 * AI output is never trusted: parseShipmentText below returns suggestions for
 * a human to edit, and postShipment re-validates everything with zod
 * regardless of whether the caller went through the AI path or typed a
 * shipment in by hand.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const lineSchema = z.object({
  existingId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(200),
  quantity: z.number().positive().max(100_000),
  unit: z.string().trim().min(1).max(30),
  unitCost: z.number().min(0).max(100_000).nullable(),
  category: z.string().trim().max(80).nullable(),
  sku: z.string().trim().max(80).nullable(),
  /** Ticked in review when the price move was over the threshold. */
  applyCost: z.boolean(),
});

const shipmentSchema = z.object({
  vendorName: z.string().trim().min(1, 'Who supplied it?').max(120),
  repId: z.string().uuid().nullable(),
  invoiceNumber: z.string().trim().max(64).nullable(),
  invoiceDate: isoDate,
  receivedDate: isoDate.nullable(),
  freight: z.number().min(0).max(1_000_000),
  tax: z.number().min(0).max(1_000_000),
  deposits: z.number().min(0).max(1_000_000),
  otherCharges: z.number().min(0).max(1_000_000),
  invoiceTotal: z.number().min(0).max(1_000_000).nullable(),
  notes: z.string().trim().max(500).nullable(),
  source: z.enum(['ai_paste', 'manual']),
  lines: z.array(lineSchema).min(1, 'A shipment needs at least one line'),
});

// ── Review types ─────────────────────────────────────────────────────────────

/**
 * Header fields already in the shape shipmentSchema expects (camelCase,
 * matching the form) rather than AIParsedShipment's snake_case — the review
 * screen (Task 8) spreads this straight into its form defaults and, on
 * submit, straight into postShipment's `raw` argument. A null means the model
 * did not find a value; the human fills it in before posting.
 */
export type ShipmentReviewHeader = {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  freight: number | null;
  tax: number | null;
  deposits: number | null;
  otherCharges: number | null;
  invoiceTotal: number | null;
};

export type ShipmentReviewLine = {
  name: string;
  quantity: number;
  unit: string;
  unitCost: number | null;
  category: string | null;
  sku: string | null;
  existingId: string | null;
  currentCost: number | null;
};

export type ShipmentReview = {
  header: ShipmentReviewHeader;
  lines: ShipmentReviewLine[];
};

/** A DB numeric column comes back as `any` from the untyped admin client. */
function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/**
 * Reads a pasted invoice with AI and matches its lines against this org's
 * existing items. Makes no writes — the result is a suggestion for a human to
 * edit in the review screen before postShipment commits anything.
 */
export async function parseShipmentText(text: string): Promise<ShipmentReview> {
  const { org, role } = await getCurrentOrg();
  // Gated even though this writes nothing: it spends Groq quota, and a
  // staff-role user who cannot post a shipment has no legitimate reason to
  // burn that spend parsing one.
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const parsed = await parseShipmentWithAI(text);
  const supabase = createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from('inventory_items')
    .select('id, name, sku, cost_price')
    .eq('organization_id', org.id);

  // An error here must not be swallowed: silently treating it as "no
  // existing items" would make every line in the invoice look new, and
  // postShipment's own duplicate-name defense depends on this same read
  // working correctly.
  if (existingError) {
    throw new Error(`Could not read this org's inventory items: ${existingError.message}`);
  }

  // Matched by exact lowercased name first, SKU second — a distributor's SKU
  // is stable across relabels but plenty of invoice lines don't carry one.
  const byName = new Map<string, { id: string; cost_price: number | null }>();
  const bySku = new Map<string, { id: string; cost_price: number | null }>();
  for (const item of existing ?? []) {
    byName.set(String(item.name).trim().toLowerCase(), { id: item.id, cost_price: item.cost_price });
    if (item.sku) {
      bySku.set(String(item.sku).trim().toLowerCase(), { id: item.id, cost_price: item.cost_price });
    }
  }

  const lines: ShipmentReviewLine[] = parsed.items.map((item) => {
    const nameKey = item.name.trim().toLowerCase();
    const skuKey = item.sku ? item.sku.trim().toLowerCase() : null;
    const match = byName.get(nameKey) ?? (skuKey ? bySku.get(skuKey) : undefined);

    return {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      unitCost: item.cost_price,
      category: item.category,
      sku: item.sku,
      existingId: match?.id ?? null,
      currentCost: match ? toNumberOrNull(match.cost_price) : null,
    };
  });

  return {
    header: {
      vendorName: parsed.vendor_name,
      invoiceNumber: parsed.invoice_number,
      invoiceDate: parsed.invoice_date,
      freight: parsed.freight,
      tax: parsed.tax,
      deposits: parsed.deposits,
      otherCharges: parsed.other_charges,
      invoiceTotal: parsed.invoice_total,
    },
    lines,
  };
}

/**
 * Commits a reviewed shipment: one inventory_shipments header row, one
 * usage_logs delivery row per line, and a current_stock bump per item.
 *
 * `raw` is untrusted no matter where it came from — the AI path went through
 * parseShipmentText above, but a hand-typed shipment never did, and either way
 * the client can send anything it likes. shipmentSchema is the only gate that
 * matters here.
 */
export async function postShipment(raw: unknown): Promise<{ shipmentId: string; linesPosted: number }> {
  const { org, role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const input = shipmentSchema.parse(raw);
  const user = await getAuthUser();
  const supabase = createAdminClient();

  const { data: shipment, error: shipmentError } = await supabase
    .from('inventory_shipments')
    .insert({
      organization_id: org.id,
      rep_id: input.repId,
      vendor_name: input.vendorName,
      invoice_number: input.invoiceNumber,
      invoice_date: input.invoiceDate,
      received_date: input.receivedDate,
      freight: input.freight,
      tax: input.tax,
      other_charges: input.otherCharges,
      deposits: input.deposits,
      invoice_total: input.invoiceTotal,
      notes: input.notes,
      source: input.source,
      created_by: user?.id ?? null,
    })
    .select('id')
    .single();

  if (shipmentError || !shipment) {
    throw new Error(`Could not save that shipment: ${shipmentError?.message ?? 'unknown error'}`);
  }

  const shipmentId: string = shipment.id;

  // Category name -> id, case-insensitive, creating missing ones. Copied from
  // importInventoryItems in inventory/actions.ts rather than imported: it is a
  // closure over this catMap and this supabase client, not a standalone
  // function that could be called from elsewhere.
  const { data: existingCats, error: existingCatsError } = await supabase
    .from('inventory_categories')
    .select('id, name')
    .eq('organization_id', org.id);

  if (existingCatsError) {
    throw new Error(`Could not read this org's categories: ${existingCatsError.message}`);
  }

  const catMap = new Map<string, string>();
  for (const c of existingCats ?? []) catMap.set(c.name.toLowerCase(), c.id);

  // inventory_items carries UNIQUE (organization_id, name). Every line below
  // is checked against this org's real items by lowercased name (SKU as a
  // fallback) before it is allowed anywhere near the create branch — the same
  // resolution parseShipmentText already does. Without this, a line whose
  // existingId is null (a hand-typed shipment never has one) or fails the
  // per-line re-verification below, but whose name happens to match a real
  // item — a manager typing "Tito's Handmade Vodka 750ml" again, or a stale
  // id surviving a delete-and-recreate — falls straight into an insert that
  // trips the unique constraint. That throw would abort this loop midway
  // with the header and the earlier lines already committed: a partial
  // financial document with no way to finish or cleanly retry it.
  const { data: existingItems, error: existingItemsError } = await supabase
    .from('inventory_items')
    .select('id, name, sku, current_stock')
    .eq('organization_id', org.id);

  if (existingItemsError) {
    throw new Error(`Could not read this org's inventory items: ${existingItemsError.message}`);
  }

  const itemByName = new Map<string, { id: string; current_stock: number }>();
  const itemBySku = new Map<string, { id: string; current_stock: number }>();
  for (const it of existingItems ?? []) {
    itemByName.set(String(it.name).trim().toLowerCase(), { id: it.id, current_stock: Number(it.current_stock ?? 0) });
    if (it.sku) {
      itemBySku.set(String(it.sku).trim().toLowerCase(), { id: it.id, current_stock: Number(it.current_stock ?? 0) });
    }
  }

  async function resolveCategoryId(name: string | null): Promise<string | null> {
    if (!name) return null;
    const key = name.toLowerCase();
    if (catMap.has(key)) return catMap.get(key)!;
    const { data, error } = await supabase
      .from('inventory_categories')
      .insert({ organization_id: org.id, name })
      .select('id')
      .single();
    if (error || !data) return null;
    catMap.set(key, data.id);
    return data.id;
  }

  let linesPosted = 0;

  for (const line of input.lines) {
    let itemId: string | null = null;
    let priorStock = 0;

    if (line.existingId) {
      // line.existingId came from the client's review step, not from a query
      // this function has run — it is a suggestion, not a fact, and a client
      // can send any UUID it likes. Confirm it names a real item in THIS org
      // before using it for anything below; a hit here is what makes reusing
      // it without re-filtering safe.
      const { data: current } = await supabase
        .from('inventory_items')
        .select('id, current_stock')
        .eq('id', line.existingId)
        .eq('organization_id', org.id)
        .maybeSingle();

      if (current) {
        itemId = current.id;
        priorStock = Number(current.current_stock ?? 0);
      }
      // Else: the id does not belong to this org, or does not exist at all.
      // Falling through is fine — the name/SKU resolution just below is the
      // real safety net, and if that also comes up empty the line still
      // posts as a new item.
    }

    const nameKey = line.name.trim().toLowerCase();
    const skuKey = line.sku ? line.sku.trim().toLowerCase() : null;

    if (!itemId) {
      // The client-supplied existingId missed. Before treating this as a
      // brand-new product, check whether this org already has one by name
      // (SKU as a fallback) — see the comment above itemByName/itemBySku for
      // why skipping this is what caused the unique-constraint abort.
      const nameMatch = itemByName.get(nameKey) ?? (skuKey ? itemBySku.get(skuKey) : undefined);
      if (nameMatch) {
        itemId = nameMatch.id;
        priorStock = nameMatch.current_stock;
      }
    }

    if (!itemId) {
      const categoryId = await resolveCategoryId(line.category);
      const { data: created, error: createError } = await supabase
        .from('inventory_items')
        .insert({
          organization_id: org.id,
          name: line.name,
          unit: line.unit,
          category_id: categoryId,
          sku: line.sku,
          cost_price: line.applyCost ? line.unitCost : null,
          current_stock: line.quantity,
          par_level: null,
          sale_price: null,
        })
        .select('id')
        .single();

      if (createError || !created) {
        throw new Error(`Could not create item "${line.name}": ${createError?.message ?? 'unknown error'}`);
      }
      const newItemId: string = created.id;
      itemId = newItemId;

      // Register it in the same-name/SKU maps immediately: an invoice can
      // list one product across two lines (a split delivery), and without
      // this a second line for the item this loop JUST created would not
      // see it either, and would try to insert the same name again —
      // exactly the unique-constraint abort this whole block exists to
      // prevent.
      itemByName.set(nameKey, { id: newItemId, current_stock: line.quantity });
      if (skuKey) itemBySku.set(skuKey, { id: newItemId, current_stock: line.quantity });
    } else {
      const update: Record<string, unknown> = { current_stock: priorStock + line.quantity };
      // Cost price only moves when the human ticked applyCost in review — a
      // line nobody confirmed must never silently reprice the item.
      if (line.applyCost && line.unitCost !== null) update.cost_price = line.unitCost;

      // admin-scope-ok: `itemId` was resolved just above — either a scoped
      // per-id lookup a few lines up, or a match against existingItems
      // (fetched further up filtered by .eq('organization_id', org.id)) —
      // so it is always in-org either way.
      const { error: updateError } = await supabase
        .from('inventory_items')
        .update(update)
        .eq('id', itemId);

      if (updateError) {
        throw new Error(`Could not update "${line.name}": ${updateError.message}`);
      }
    }

    // admin-scope-ok: `itemId` above is one of three things, all in-org: a
    // scoped per-id lookup a few lines up, a match against existingItems
    // (fetched further up filtered by .eq('organization_id', org.id)), or an
    // id this function just created with organization_id: org.id itself.
    const { error: usageError } = await supabase.from('usage_logs').insert({
      organization_id: org.id,
      item_id: itemId,
      quantity: line.quantity,
      reason: 'delivery',
      unit_cost: line.unitCost,
      shipment_id: shipmentId,
      note: `Shipment ${input.invoiceNumber ?? input.vendorName}`,
    });

    if (usageError) {
      throw new Error(`Could not log the delivery for "${line.name}": ${usageError.message}`);
    }

    linesPosted++;
  }

  revalidatePath('/app/inventory');
  revalidatePath('/app/inventory/shipments');
  revalidatePath('/app/books');

  return { shipmentId, linesPosted };
}

/**
 * Voids a shipment: marks it voided and reverses the stock it added, without
 * deleting the record or touching any item's cost price.
 *
 * Cost prices are deliberately NOT rolled back. A later invoice may already
 * have moved an item's price since this one posted, and guessing which figure
 * is "right" is worse than leaving the current one alone — see the comment on
 * inventory_shipments.voided_at in the migration.
 */
export async function voidShipment(shipmentId: string): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const user = await getAuthUser();
  const supabase = createAdminClient();

  // Copy of assertReportInOrg (inventory/weigh/actions.ts): confirm the row is
  // this org's BEFORE anything hanging off it is touched. Same message
  // whether the id is missing or belongs to another bar, so the error cannot
  // be used to learn which invoice ids exist.
  const { data: shipment } = await supabase
    .from('inventory_shipments')
    .select('id, voided_at, invoice_number, vendor_name')
    .eq('id', shipmentId)
    .eq('organization_id', org.id)
    .maybeSingle();

  if (!shipment) throw new Error('Shipment not found');
  // This guard only fires once EVERY line has been reversed — voided_at is
  // set at the very end of this function, after the loop below completes
  // without throwing. That ordering is what makes it safe to keep: a retry
  // after a partial failure (row 3 of 5 hits a transient error, say) finds
  // voided_at still null and is allowed back in to finish the rest, rather
  // than being permanently refused with two lines reversed and three not.
  if (shipment.voided_at) throw new Error('Shipment is already voided');

  // Only 'delivery' rows are this shipment's original lines. The reversal
  // rows this function writes below share the same shipment_id but carry
  // reason: 'other' (see below), so this filter can never pick up and
  // re-reverse its own reversal rows.
  const { data: deliveryRows, error: rowsError } = await supabase
    .from('usage_logs')
    .select('item_id, quantity')
    .eq('shipment_id', shipmentId)
    .eq('organization_id', org.id)
    .eq('reason', 'delivery');

  if (rowsError) {
    throw new Error(`Could not read that shipment's stock movements: ${rowsError.message}`);
  }

  // Grouped by item, not left as one row per original delivery line. An
  // invoice can list the same product on two lines (a split delivery), and
  // reversing per item rather than per row is what makes the idempotency
  // check just below well-defined: for a given item there is either one
  // reversal row (fully done) or none (not started) — never a partial state
  // to reconcile if this function is retried after a failure.
  const qtyByItem = new Map<string, number>();
  for (const row of deliveryRows ?? []) {
    if (!row.item_id) continue;
    qtyByItem.set(row.item_id, (qtyByItem.get(row.item_id) ?? 0) + Number(row.quantity ?? 0));
  }

  // Which items a PRIOR, partially-failed void already reversed — so a retry
  // resumes instead of double-decrementing stock that is already reversed.
  const { data: alreadyReversedRows, error: reversedError } = await supabase
    .from('usage_logs')
    .select('item_id')
    .eq('shipment_id', shipmentId)
    .eq('organization_id', org.id)
    .eq('reason', 'other');

  if (reversedError) {
    throw new Error(`Could not check this shipment's void progress: ${reversedError.message}`);
  }

  const alreadyReversedItemIds = new Set((alreadyReversedRows ?? []).map((r) => r.item_id));

  for (const [itemId, quantity] of qtyByItem) {
    if (alreadyReversedItemIds.has(itemId)) continue;

    // admin-scope-ok: `itemId` is a key of qtyByItem, built from usage_logs
    // rows filtered by .eq('organization_id', org.id) above, so it is always
    // in-org.
    const { data: item } = await supabase
      .from('inventory_items')
      .select('id, current_stock')
      .eq('id', itemId)
      .maybeSingle();

    // The item itself may since have been deleted. There is no stock left to
    // reverse it on and no item to log against — skip rather than fail the
    // whole void over one missing item. Skipping writes no reversal row, so
    // a retry (or this same run, if a later item throws) finds it still
    // unreversed and tries again — harmlessly, since it will still be gone.
    if (!item) continue;

    // Not clamped to zero: if this item has since been sold through, a
    // negative count is real information — an over-sold position caused by
    // voiding a delivery whose stock already left the building — not a bug
    // to paper over.
    const newStock = Number(item.current_stock ?? 0) - quantity;

    // admin-scope-ok: `item` was fetched immediately above by `itemId`,
    // itself in-org per the comment on that lookup.
    const { error: stockError } = await supabase
      .from('inventory_items')
      .update({ current_stock: newStock })
      .eq('id', itemId);

    if (stockError) throw new Error(`Could not reverse stock: ${stockError.message}`);

    // reason: 'other', deliberately NOT 'recount' as the original brief for
    // this file specified — overruled on review. SHRINKAGE_REASONS in both
    // app/(app)/app/inventory/analytics/actions.ts and
    // app/(app)/app/analytics/actions.ts treats 'recount' as shrinkage/loss,
    // so a voided delivery would show up as the bar having LOST the cases it
    // sent back, which is wrong and materially misleads those reports.
    // 'other' is a valid usage_reason (see stock-adjust-dialog.tsx's option
    // list) and sits in neither shrinkage set. Do not change this back to
    // 'recount'.
    const { error: reversalError } = await supabase.from('usage_logs').insert({
      organization_id: org.id,
      item_id: itemId,
      quantity,
      reason: 'other',
      unit_cost: null,
      shipment_id: shipmentId,
      note: `Void of shipment ${shipment.invoice_number ?? shipment.vendor_name}`,
    });

    if (reversalError) throw new Error(`Could not log the void: ${reversalError.message}`);
  }

  // Only reached once every item above has either been reversed just now,
  // was already reversed by a prior attempt, or was permanently skipped
  // (deleted item) — never partway through a fresh failure.
  //
  // admin-scope-ok: `shipmentId` was confirmed above with
  // .eq('organization_id', org.id), and the function throws when it is
  // missing, so this id is always in-org.
  const { error: voidError } = await supabase
    .from('inventory_shipments')
    .update({ voided_at: new Date().toISOString(), voided_by: user?.id ?? null })
    .eq('id', shipmentId);

  if (voidError) throw new Error(`Could not void that shipment: ${voidError.message}`);

  revalidatePath('/app/inventory');
  revalidatePath('/app/inventory/shipments');
  revalidatePath('/app/books');
}

/**
 * A shipment as the list screen (and Task 9's books view) need it: the
 * header charges plus what the line rows actually sum to, independent of
 * whatever price the items carry today.
 */
export type ShipmentSummary = {
  id: string;
  vendorName: string;
  invoiceNumber: string | null;
  invoiceDate: string;        // YYYY-MM-DD
  lineCount: number;
  computedTotal: number;      // line sum + freight + tax + other + deposits
  invoiceTotal: number | null;
  voided: boolean;
};

/** A generous but bounded page size — see the comment on `safeLimit` below. */
const MAX_SHIPMENTS_LIMIT = 200;

/**
 * Recent shipments for the list screen, newest invoice first.
 *
 * One query per shipment for its lines, not a single .in(shipment_id, ids)
 * across all of them. supabase/config.toml sets max_rows = 1000 — a hard cap
 * PostgREST applies to every response with no error when it truncates. A
 * distributor invoice commonly runs 30-40 lines, so a handful of pages'
 * worth of shipments can together exceed 1000 lines with room to spare; a
 * shipment whose lines fall off the end of that cap would silently report
 * lineCount: 0 and a computedTotal of just its header charges. Querying per
 * shipment, scoped to that one shipment_id, makes hitting the cap on a
 * single invoice's own lines essentially impossible, and also removes any
 * need for a `.in()` list sized by however many shipments were asked for.
 */
export async function listShipments(limit = 50): Promise<ShipmentSummary[]> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  // `limit` is client-supplied and was previously passed straight to
  // .limit() unvalidated. Clamped here so an absurd value can neither
  // silently get capped by max_rows on the query below (returning fewer
  // shipments than asked for, with no error) nor drive an unreasonable
  // number of per-shipment queries just below.
  const safeLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.trunc(limit), 1), MAX_SHIPMENTS_LIMIT)
    : 50;

  const { data: shipments, error } = await supabase
    .from('inventory_shipments')
    .select('id, vendor_name, invoice_number, invoice_date, freight, tax, deposits, other_charges, invoice_total, voided_at')
    .eq('organization_id', org.id)
    .order('invoice_date', { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(`Could not load shipments: ${error.message}`);
  if (!shipments || shipments.length === 0) return [];

  const lineAggregates = await Promise.all(
    shipments.map(async (s) => {
      const { data: lines, error: linesError } = await supabase
        .from('usage_logs')
        .select('quantity, unit_cost')
        .eq('shipment_id', s.id)
        .eq('organization_id', org.id)
        .eq('reason', 'delivery');

      if (linesError) {
        throw new Error(`Could not load lines for shipment ${s.id}: ${linesError.message}`);
      }

      let count = 0;
      let lineTotal = 0;
      for (const line of lines ?? []) {
        count += 1;
        // A null unit_cost means no price was recorded on this line — it
        // still counts toward lineCount, just not toward the dollar total.
        if (line.unit_cost !== null) lineTotal += Number(line.quantity) * Number(line.unit_cost);
      }
      return { id: s.id as string, count, lineTotal };
    }),
  );

  const byShipment = new Map(lineAggregates.map((a) => [a.id, a]));

  return shipments.map((s) => {
    const agg = byShipment.get(s.id) ?? { count: 0, lineTotal: 0 };
    return {
      id: s.id,
      vendorName: s.vendor_name,
      invoiceNumber: s.invoice_number,
      invoiceDate: s.invoice_date,
      lineCount: agg.count,
      computedTotal:
        agg.lineTotal + Number(s.freight) + Number(s.tax) + Number(s.other_charges) + Number(s.deposits),
      invoiceTotal: s.invoice_total === null ? null : Number(s.invoice_total),
      voided: s.voided_at !== null,
    };
  });
}
