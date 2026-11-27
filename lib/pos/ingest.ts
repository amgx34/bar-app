/**
 * The shared applier: a NormalizedPayload in, rows written, an outcome out.
 *
 * Extracted verbatim from the 2Touch ingest route so Clover and Toast go
 * through the same Z upsert, manual-tip and manual-hour guards, exclusion and
 * bundle handling, delta depletion through pos_apply_item_sales, and per-night
 * replace of hourly and server trade. Order of statements is pinned by
 * app/api/2touch/ingest/route.characterization.test.ts.
 *
 * It does NOT write pos_config. The caller owns that, building each write from
 * the latest config and threading it forward (lib/pos/pos-config.ts), and skips
 * the sync-outcome write when `payload.backfill` is set.
 */

import type { createAdminClient } from '@/lib/supabase/admin';
import { buildExclusionSet, isExcluded, posItemMatchKey } from '@/lib/pos/excluded-items';
import { resolveSales, toRpcComponents, type BundleRecipe, type InventoryRef } from '@/lib/pos/bundles';
import { buildTokenTable, parseVariant } from '@/lib/pos/variants';
import { partitionShifts, shiftKey } from '@/lib/payroll/manual-hours';
import type { SyncSummary } from '@/lib/pos/sync-health';
import { normaliseHourlyRows, groupByNight } from '@/lib/pos/hourly-sales';
import { normaliseServerRows, groupServerRowsByNight } from '@/lib/pos/server-sales';
import type { NormalizedPayload } from '@/lib/pos/normalized';

type Admin = ReturnType<typeof createAdminClient>;

export type ApplyContext = {
  /** bar_settings of the org, for the org-wide pour default. */
  barSettings: Record<string, unknown>;
  /** Prepended to payload.errors so a reader can tell which side of the wire broke. */
  errorPrefix: string;
};

// Shapes written to Supabase. Collected into arrays and sent as one upsert per
// table rather than one per row.

type ShiftInsert = {
  organization_id: string;
  employee_id:     string;
  shift_date:      string;
  regular_hours:   number;
  overtime_hours:  number;
};

type ServerTipInsert = {
  organization_id: string;
  report_date:     string;
  employee_name:   string;
  total_sales:     number;
  tips_paid_out:   number;
};

type InventoryItemInsert = {
  organization_id: string;
  name:            string;
  category_id:     string | null;
  unit:            string;
  is_active:       boolean;
};

export function toSyncSummary(r: ApplyResult): SyncSummary {
  return {
    zReports: r.zReports,
    ewReports: r.ewReports,
    shiftsProtected: r.shiftsProtected,
    itemAudit: r.itemAudit,
    stockMoved: r.stockMoved,
    unresolvedItems: r.unresolvedItems,
    hoursRecorded: r.hoursRecorded,
    serversRecorded: r.serversRecorded,
  };
}

export async function applyNormalized(
  admin: Admin,
  orgId: string,
  payload: NormalizedPayload,
  ctx: ApplyContext,
) {
  const { barSettings } = ctx;
  const { zReports, ewReports } = payload;
  let { itemAudit } = payload;

  const result = {
    zReports: 0,
    ewReports: 0,
    // Shifts left alone because a person had corrected them. Reported so a
    // silently-skipped write is visible in the agent log rather than looking
    // like the sync did nothing.
    shiftsProtected: 0,
    itemAudit: 0,
    itemAuditSkipped: 0,
    // Bundle/depletion observability. `stockMoved` counts item-days actually
    // changed, which on a repeated sync of an unchanged day is correctly zero.
    bundlesExpanded: 0,
    salesRecorded: 0,
    stockMoved: 0,
    unresolvedItems: 0,
    hoursRecorded: 0,
    serversRecorded: 0,
    errors: [] as string[],
  };

  // ── Z Reports → z_report_days ─────────────────────────────────────────────

  if (zReports?.length) {
    const incoming = zReports.filter(r => r.report_date && r.total_sales >= 0);

    // Cash tips a person counted are protected from being overwritten.
    //
    // This endpoint receives a rolling two-day window every five minutes, and
    // 2Touch reports 0 cash tips for nearly every bar because nobody rings them
    // in. Left alone, the sync would erase a manager's jar count minutes after
    // it was entered, silently, every night. Rows marked 'manual' keep the
    // figure they were given; see the migration for the reasoning.
    const manualCashTips = new Map<string, number>();
    if (incoming.length) {
      const { data: existing } = await admin
        .from('z_report_days')
        .select('report_date, cash_tips, cash_tips_source')
        .eq('organization_id', orgId)
        .eq('cash_tips_source', 'manual')
        .in('report_date', incoming.map(r => r.report_date));

      for (const row of existing ?? []) {
        manualCashTips.set(row.report_date, Number(row.cash_tips) || 0);
      }
    }

    const money = (n: number) => Math.round(n * 100) / 100;

    const rows = incoming.map(r => {
      const manual = manualCashTips.get(r.report_date);
      const base = {
        organization_id: orgId,
        report_date:     r.report_date,
        total_sales:     money(r.total_sales),
        cc_tips:         money(r.cc_tips ?? 0),
        // Undefined stays NULL. A source that cannot report the split is
        // saying "I don't know", and writing 0 would turn that into a claim
        // that the night was card-only.
        cash_sales:      r.cash_sales === undefined ? null : money(r.cash_sales),
        card_sales:      r.card_sales === undefined ? null : money(r.card_sales),
      };
      // A source that does not report cash tips omits BOTH columns, so the
      // upsert leaves whatever is stored (a person's count, or the default on a
      // new row) untouched. A manual night keeps its figure either way.
      if (r.cash_tips === undefined) return { reported: false, row: base };
      return {
        reported: true,
        row: {
          ...base,
          cash_tips:        manual ?? money(r.cash_tips),
          cash_tips_source: manual === undefined ? 'pos' : 'manual',
        },
      };
    });

    // Two statements, because a bulk upsert sends the union of its rows' keys
    // and fills the gaps with NULL: mixing the groups would null a stored
    // cash_tips. 2Touch always reports cash tips, so for it this is one call.
    for (const group of [rows.filter(r => r.reported), rows.filter(r => !r.reported)]) {
      if (!group.length) continue;
      const { error } = await admin
        .from('z_report_days')
        .upsert(group.map(g => g.row), { onConflict: 'organization_id,report_date' });
      if (error) result.errors.push(`z_report_days: ${error.message}`);
      else result.zReports += group.length;
    }
  }

  // ── EW Reports → employee_shifts + z_report_server_tips ──────────────────

  // This section used to issue two round-trips PER ROW (plus one insert per
  // unseen employee). At ~165ms each, a two-week backfill needed well over the
  // 30s function budget and died mid-write with a 504, leaving the payload
  // half-applied. It is now a fixed handful of statements regardless of size.

  if (ewReports?.length) {
    const rows = ewReports.filter(r => r.employee_name?.trim() && r.shift_date);

    const { data: empRows, error: empErr } = await admin
      .from('employees')
      .select('id, name')
      .eq('organization_id', orgId);
    if (empErr) result.errors.push(`employees: ${empErr.message}`);

    const empByName = new Map(
      (empRows ?? []).map(e => [e.name.toLowerCase(), e.id]),
    );

    // Create every unseen employee in one insert. Keyed lowercase so a bar that
    // spells a name two ways doesn't end up with two employee records.
    const newNames = [...new Map(
      rows
        .map(r => r.employee_name.trim())
        .filter(n => !empByName.has(n.toLowerCase()))
        .map(n => [n.toLowerCase(), n]),
    ).values()];

    if (newNames.length) {
      const { data: created, error } = await admin
        .from('employees')
        .insert(newNames.map(name => ({
          organization_id: orgId,
          name,
          tip_mode: 'pool',
        })))
        .select('id, name');
      if (error) result.errors.push(`employees: ${error.message}`);
      for (const e of created ?? []) empByName.set(e.name.toLowerCase(), e.id);
    }

    // Postgres rejects an ON CONFLICT statement that touches the same key twice
    // ("cannot affect row a second time"), so collapse duplicates before
    // sending. Keyed exactly like each table's unique constraint, and last row
    // wins — the same result the previous row-by-row upserts produced.
    const shifts = new Map<string, ShiftInsert>();
    const tips   = new Map<string, ServerTipInsert>();

    for (const row of rows) {
      const name  = row.employee_name.trim();
      const empId = empByName.get(name.toLowerCase());
      if (!empId) continue;

      shifts.set(shiftKey(empId, row.shift_date), {
        organization_id: orgId,
        employee_id:     empId,
        shift_date:      row.shift_date,
        regular_hours:   row.regular_hours  ?? 0,
        overtime_hours:  row.overtime_hours ?? 0,
      });

      if (row.tips_paid_out > 0) {
        tips.set(`${row.shift_date}|${name}`, {
          organization_id: orgId,
          report_date:     row.shift_date,
          employee_name:   name,
          total_sales:     row.total_sales   ?? 0,
          tips_paid_out:   row.tips_paid_out ?? 0,
        });
      }
    }

    // Hours a person corrected by hand are protected from being overwritten.
    //
    // Same problem, and the same shape of fix, as the cash-tips guard above.
    // The agent re-sends a rolling window every five minutes, so an unguarded
    // upsert reverted every manual correction within minutes of it being made
    // — while leaving the payroll_adjustments row in place, so the audit log
    // described a change the pay run no longer reflected.
    //
    // Read once for the whole window rather than per row: this is a 5-minute
    // loop and the previous version of this block was rewritten specifically to
    // stop issuing round-trips per shift.
    if (shifts.size) {
      const dates = [...new Set([...shifts.values()].map(s => s.shift_date))];
      const { data: manualRows, error: manualErr } = await admin
        .from('employee_shifts')
        .select('employee_id, shift_date')
        .eq('organization_id', orgId)
        .eq('hours_source', 'manual')
        .in('shift_date', dates);

      // Fail loudly rather than overwriting. If this lookup breaks we cannot
      // tell which rows are protected, and guessing "none" silently destroys
      // exactly the corrections this guard exists to keep.
      if (manualErr) {
        result.errors.push(`employee_shifts manual lookup: ${manualErr.message}`);
      }

      if (!manualErr) {
        const { writable, protectedCount } = partitionShifts(shifts, manualRows ?? []);

        if (writable.length) {
          const { error } = await admin
            .from('employee_shifts')
            .upsert(writable, { onConflict: 'organization_id,employee_id,shift_date' });
          if (error) result.errors.push(`employee_shifts: ${error.message}`);
          else result.ewReports = writable.length;
        }

        result.shiftsProtected = protectedCount;
      }
    }

    if (tips.size) {
      const { error } = await admin
        .from('z_report_server_tips')
        .upsert([...tips.values()], { onConflict: 'organization_id,report_date,employee_name' });
      if (error) result.errors.push(`z_report_server_tips: ${error.message}`);
    }
  }

  // ── Item Audit → inventory items + categories ────────────────────────────

  if (itemAudit?.length) {
    // Deals and combos ring up like products but are not stock. Filtering here
    // rather than after the upsert means they never reach inventory at all.
    const { data: exclusionRows, error: exclusionErr } = await admin
      .from('pos_excluded_items')
      .select('match_key')
      .eq('organization_id', orgId);

    if (exclusionErr) {
      // Fail loudly rather than silently syncing everything: a dropped
      // exclusion list would refill inventory with the deals the operator
      // already removed once.
      result.errors.push(`pos_excluded_items: ${exclusionErr.message}`);
    }

    const exclusions = buildExclusionSet(exclusionRows ?? []);
    const skipped: string[] = [];

    itemAudit = itemAudit.filter((r) => {
      const name = r.item_name?.trim();
      if (name && isExcluded(name, exclusions)) {
        skipped.push(name);
        return false;
      }
      return true;
    });

    if (skipped.length) {
      console.log(`[pos] skipped ${skipped.length} excluded item(s)`);
    }
    result.itemAuditSkipped = skipped.length;
  }

  if (itemAudit?.length) {
    // ── Bundle recipes ──────────────────────────────────────────────────────
    //
    // Loaded before anything is created, because a bundle must never become an
    // inventory item — that is the phantom-stock problem this exists to end.
    const { data: bundleRows, error: bundleErr } = await admin
      .from('pos_bundles')
      .select('id, match_key, pos_bundle_components(inventory_item_id, quantity, unit)')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (bundleErr) {
      // Same reasoning as the exclusion list: syncing as though no bundle
      // existed would recreate the phantom items and deplete nothing.
      result.errors.push(`pos_bundles: ${bundleErr.message}`);
    }

    const bundles: BundleRecipe[] = (bundleRows ?? []).map((b) => ({
      match_key: b.match_key,
      components: (b.pos_bundle_components ?? []).map((c) => ({
        inventory_item_id: c.inventory_item_id,
        quantity: Number(c.quantity),
        unit: (c.unit === 'oz' ? 'oz' : 'each') as 'each' | 'oz',
      })),
    }));
    const bundleKeySet = new Set(bundles.map((b) => b.match_key));

    // ── Size tokens ─────────────────────────────────────────────────────────
    //
    // "DBL TITO'S" is two ounces of the item inventory calls "Tito's". Loaded
    // before item creation for the same reason bundles are: a variant name must
    // not become an inventory item of its own.
    //
    // An org with no rows falls back to the four built-in tokens — an error
    // here would silently revert that, so it is reported rather than swallowed.
    const { data: tokenRows, error: tokenErr } = await admin
      .from('pos_size_tokens')
      .select('token, multiplier, label, mixer')
      .eq('organization_id', orgId);

    if (tokenErr) result.errors.push(`pos_size_tokens: ${tokenErr.message}`);

    const sizeTokens = buildTokenTable(
      (tokenRows ?? []).map((t) => ({
        token: String(t.token),
        multiplier: Number(t.multiplier),
        label: String(t.label ?? ''),
        mixer: (t.mixer as string | null) ?? null,
      })),
    );

    // Rows that are genuinely stock. Bundles are excluded from category and
    // item creation but stay in `itemAudit` for the sales facts below,
    // because their revenue belongs to the deal, not to its components.
    const stockRows = itemAudit.filter(
      (r) => r.item_name?.trim() && !bundleKeySet.has(posItemMatchKey(r.item_name.trim())),
    );

    const catNames = [...new Set(stockRows.map(r => r.category_name).filter(Boolean))];
    const catIdMap = new Map<string, string>();

    if (catNames.length) {
      const { data: cats, error } = await admin
        .from('inventory_categories')
        .upsert(
          catNames.map(name => ({ organization_id: orgId, name })),
          { onConflict: 'organization_id,name' },
        )
        .select('id, name');
      if (error) result.errors.push(`inventory_categories: ${error.message}`);
      for (const c of cats ?? []) catIdMap.set(c.name, c.id);
    }

    // Keyed on name alone, matching the UNIQUE (organization_id, name)
    // constraint this upsert targets.
    const items = new Map<string, InventoryItemInsert>();
    for (const row of stockRows) {
      const raw = row.item_name?.trim();
      if (!raw) continue;
      // Create the BASE item, never the variant. This is where the phantom
      // "DBL TITO'S" rows came from: four tokens times every spirit, each one
      // uncosted and undepleting, sitting next to the real item. When the base
      // already exists the upsert is a no-op, which is the point.
      const name = parseVariant(raw, sizeTokens).baseName || raw;
      items.set(name, {
        organization_id: orgId,
        name,
        category_id: catIdMap.get(row.category_name ?? '') ?? null,
        unit:        'each',
        is_active:   true,
      });
    }

    if (items.size) {
      // ignoreDuplicates leaves items the bar already has untouched, so manual
      // edits to category/unit/pricing survive the next sync.
      //
      // The error check matters: this upsert silently failed with 42P10 on
      // every row until inventory_items got its UNIQUE (organization_id, name)
      // constraint, while the old code still counted the rows as written.
      const { error } = await admin
        .from('inventory_items')
        .upsert([...items.values()], {
          onConflict: 'organization_id,name',
          ignoreDuplicates: true,
        });
      if (error) result.errors.push(`inventory_items: ${error.message}`);
      else result.itemAudit = items.size;
    }

    // ── Sales facts and stock depletion ────────────────────────────────────
    //
    // Read back after the upsert rather than from its return value:
    // `ignoreDuplicates` returns nothing for rows that already existed, which
    // is most of them on every sync after the first.
    const { data: allItems, error: itemsErr } = await admin
      .from('inventory_items')
      .select('id, name, bottle_size_ml, pour_size_oz, inventory_categories(default_pour_oz)')
      .eq('organization_id', orgId);

    if (itemsErr) result.errors.push(`inventory_items lookup: ${itemsErr.message}`);

    // Pour figures travel with the item so depletion can convert a shot into a
    // fraction of a bottle. Without this a spirit sold 185 times removed 185
    // bottles. See lib/pos/pour.ts.
    const itemsByMatchKey = new Map<string, InventoryRef>();
    for (const item of allItems ?? []) {
      const cat = item.inventory_categories as unknown;
      const catObj = Array.isArray(cat) ? cat[0] : cat;
      itemsByMatchKey.set(posItemMatchKey(item.name), {
        id: item.id,
        bottleSizeMl: item.bottle_size_ml === null ? null : Number(item.bottle_size_ml),
        pourSizeOz: item.pour_size_oz === null ? null : Number(item.pour_size_oz),
        categoryPourOz:
          (catObj as { default_pour_oz?: number | null } | undefined)?.default_pour_oz ?? null,
      });
    }

    // Org-wide fallback, the last step of the item -> category -> org chain.
    const orgPourOz = Number(
      (barSettings as { default_pour_oz?: number }).default_pour_oz,
    ) || null;

    const resolved = resolveSales(
      itemAudit, bundles, itemsByMatchKey, orgPourOz, sizeTokens,
    );
    result.bundlesExpanded = resolved.bundleKeys.size;
    result.unresolvedItems = resolved.unresolvedNames.length;

    if (resolved.facts.length) {
      const { error } = await admin
        .from('pos_item_sales')
        .upsert(
          resolved.facts.map((f) => ({
            organization_id: orgId,
            sale_date:     f.sale_date,
            item_name:     f.item_name,
            match_key:     f.match_key,
            category_name: f.category_name,
            qty_sold:      f.qty_sold,
            net_sales:     Math.round(f.net_sales * 100) / 100,
            is_bundle:      f.is_bundle,
            base_match_key: f.base_match_key,
            size_token:     f.size_token,
            updated_at:     new Date().toISOString(),
          })),
          { onConflict: 'organization_id,sale_date,match_key' },
        );
      if (error) result.errors.push(`pos_item_sales: ${error.message}`);
      else result.salesRecorded = resolved.facts.length;
    }

    // One call per business day. The agent's lookback is two days by default,
    // so this is two or three round trips — not a loop over rows.
    //
    // Each call is delta-based against pos_stock_applications, which is what
    // makes re-sending the same day every five minutes a no-op instead of
    // draining the bar's stock. See the migration for the full reasoning.
    for (const [saleDate, dayMap] of resolved.depletionByDate) {
      const { data: moved, error } = await admin.rpc('pos_apply_item_sales', {
        p_org:        orgId,
        p_sale_date:  saleDate,
        p_components: toRpcComponents(dayMap),
      });
      if (error) {
        result.errors.push(`pos_apply_item_sales(${saleDate}): ${error.message}`);
        // Keep going: a failure on one day should not block the others, and the
        // ledger means the failed day is simply retried on the next sync.
        continue;
      }
      result.stockMoved += (moved ?? []).length;
    }

    if (resolved.unresolvedNames.length) {
      // Expected to be everything on a first sync, and a broken link afterwards
      // — a POS rename, or an item deactivated in Rail but still selling.
      console.log(
        `[pos] ${resolved.unresolvedNames.length} item(s) had no inventory match:`,
        resolved.unresolvedNames.slice(0, 20),
      );
    }
  }

  // ── Hourly trade ────────────────────────────────────────────────────────
  //
  // A per-night REPLACE, not an upsert. An hour can LOSE sales when a ticket
  // is voided after the fact, and a blind merge leaves the old figure
  // standing — the night would only ever grow. This is safe precisely because
  // the agent always sends a whole night rather than a delta.
  const hourlyRows = normaliseHourlyRows(payload.hourlySales ?? []);
  for (const [night, rows] of groupByNight(hourlyRows)) {
    // admin-scope-ok: the chain below is scoped by organization_id, and orgId
    // is the one the caller authenticated before handing the payload over.
    const { error: delErr } = await admin
      .from('pos_hourly_sales')
      .delete()
      .eq('organization_id', orgId)
      .eq('business_date', night);

    if (delErr) {
      result.errors.push(`pos_hourly_sales delete(${night}): ${delErr.message}`);
      // Skip the insert for THIS night only: inserting on top of rows that
      // were not cleared would double the night's takings.
      continue;
    }

    const { error: insErr } = await admin
      .from('pos_hourly_sales')
      .insert(
        rows.map((r) => ({
          organization_id: orgId,
          business_date:   r.business_date,
          hour:            r.hour,
          net_sales:       r.net_sales,
          ticket_count:    r.ticket_count,
          tips:            r.tips,
          updated_at:      new Date().toISOString(),
        })),
      );

    if (insErr) result.errors.push(`pos_hourly_sales(${night}): ${insErr.message}`);
    else result.hoursRecorded += rows.length;
  }

  // ── Per-server trade ────────────────────────────────────────────────────
  //
  // Same per-night replace, same reason: a server's night can shrink.
  // employee_id is deliberately NOT resolved here — see lib/pos/server-sales.ts.
  const serverRows = normaliseServerRows(payload.serverSales ?? []);
  for (const [night, rows] of groupServerRowsByNight(serverRows)) {
    // admin-scope-ok: as above, orgId is the authenticated org.
    const { error: delErr } = await admin
      .from('pos_server_sales')
      .delete()
      .eq('organization_id', orgId)
      .eq('business_date', night);

    if (delErr) {
      result.errors.push(`pos_server_sales delete(${night}): ${delErr.message}`);
      continue;
    }

    const { error: insErr } = await admin
      .from('pos_server_sales')
      .insert(
        rows.map((r) => ({
          organization_id: orgId,
          business_date:   r.business_date,
          server_name:     r.server_name,
          net_sales:       r.net_sales,
          ticket_count:    r.ticket_count,
          tips:            r.tips,
          updated_at:      new Date().toISOString(),
        })),
      );

    if (insErr) result.errors.push(`pos_server_sales(${night}): ${insErr.message}`);
    else result.serversRecorded += rows.length;
  }

  // Failures the source hit, folded in beside the ones this applier hit.
  //
  // Prefixed so a reader can tell which side of the wire broke. Bounded and
  // truncated because this is a status line on an org row, not a log store, and
  // the strings may arrive over the network.
  for (const e of (payload.errors ?? []).slice(0, 5)) {
    if (typeof e === 'string' && e.trim()) result.errors.push(`${ctx.errorPrefix}${e.slice(0, 300)}`);
  }

  return result;
}

export type ApplyResult = Awaited<ReturnType<typeof applyNormalized>>;
