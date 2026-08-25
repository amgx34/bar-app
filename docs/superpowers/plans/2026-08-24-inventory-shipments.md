# Inventory Shipments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record what a liquor delivery actually cost — vendor, invoice number, real line prices, freight — so the books value purchases from the invoice instead of inferring them from an item's current cost price.

**Architecture:** A shipment *line* is a `usage_logs` delivery row, not a separate table: the row already carries item, quantity and date, so it only gains `unit_cost` and `shipment_id`. A new `inventory_shipments` header holds the document (vendor, invoice number, freight, deposits, stated total). The books change is one expression — `l.unit_cost ?? cost_price` — so every historical delivery keeps its current valuation. Entry is AI-first: paste invoice text, a Groq parser extracts it, the operator corrects it in a review step before anything posts.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS), TypeScript, vitest, zod, Base UI (`components/ui`), Groq (`llama-3.3-70b-versatile`), Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-24-inventory-shipments-design.md`

## Global Constraints

- **`components/ui` is Base UI (`@base-ui/react`), not Radix.** No `asChild` — use `render` and controlled dialogs.
- **`createAdminClient()` bypasses RLS.** Every query through it MUST filter `.eq('organization_id', org.id)` by hand. `npm run audit:scope` exits non-zero otherwise. Where the filter genuinely does not belong, justify it in place with an `// admin-scope-ok:` comment naming the earlier scoped lookup that guarantees it.
- **Server pages start with `const { org, role } = await getCurrentOrg()`** (`lib/org.ts`).
- **`usage_logs` predates this repo's migrations.** Its `reason` is a Postgres ENUM (`usage_reason`), not TEXT with a CHECK — an earlier migration assumed otherwise and failed. Never assume anything else about that table; all DDL against it is `IF NOT EXISTS`.
- **Page-local components live in `_components/`** next to the page.
- **Money units:** `unit_cost` and every `*_total` in this feature are **dollars per stock unit**, matching `inventory_items.cost_price`. Never drink/POS units. See AGENTS.md's units table.
- **Read `node_modules/next/dist/docs/` before using an unfamiliar Next API.** This version has breaking changes from training data.
- Verification commands: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run audit:scope`, `npm run build`.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260824000000_add_inventory_shipments.sql` | `inventory_shipments` table, RLS, two `usage_logs` columns |
| `lib/inventory/shipments.ts` | **Pure money arithmetic.** Charge allocation, price-change flagging, total reconciliation. No DB, no clock. |
| `lib/inventory/shipments.test.ts` | vitest coverage for the above |
| `lib/ai-parsers/parse-shipment-with-ai.ts` | Groq parser returning an invoice header + lines |
| `app/(app)/app/inventory/shipment-actions.ts` | Server actions: parse, post, void |
| `app/(app)/app/inventory/shipments/page.tsx` | Shipment list (server component) |
| `app/(app)/app/inventory/shipments/_components/shipment-list.tsx` | List table + empty state |
| `app/(app)/app/inventory/shipments/_components/log-shipment-dialog.tsx` | Paste → review → post |
| `app/(app)/app/books/actions.ts` (modify) | Use `unit_cost` when present; fold in allocated charges |
| `app/(app)/app/_components/nav-config.ts` (modify) | Add the Shipments tab |

Tasks 1–3 have no effect on existing behaviour. Task 6 is the smallest edit with the largest blast radius — it changes reported COGS — and is deliberately late, once the data it reads can exist.

---

### Task 1: Migration — shipments table and the two `usage_logs` columns

**Files:**
- Create: `supabase/migrations/20260824000000_add_inventory_shipments.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `inventory_shipments`; columns `usage_logs.shipment_id UUID NULL`, `usage_logs.unit_cost NUMERIC(12,4) NULL`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260824000000_add_inventory_shipments.sql`:

```sql
-- What a delivery actually cost, as opposed to what we assume it cost.
--
-- THE PROBLEM
--
-- The books value a delivery as quantity * inventory_items.cost_price — the
-- item's price TODAY. So a distributor's price rise is invisible until somebody
-- hand-edits the item, freight and bottle deposits have nowhere to live at all,
-- nothing reconciles against the paperwork, and — the part that is an outright
-- bug — editing an item's cost price silently restates every past month.
--
-- THE SHAPE
--
-- A shipment LINE is a usage_logs delivery row. That row already carries item,
-- quantity and date; all it lacks is the price and a link to the document. A
-- separate line-items table would mean two records of one event that can
-- disagree, and the stock movement and the money would drift apart.

CREATE TABLE IF NOT EXISTS inventory_shipments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Either a known rep, or just a name. A bar buys from vendors it has never
  -- created a rep record for, and forcing one first would stop the entry dead.
  rep_id          UUID        REFERENCES reps(id) ON DELETE SET NULL,
  vendor_name     TEXT        NOT NULL,

  invoice_number  TEXT,
  invoice_date    DATE        NOT NULL,
  received_date   DATE,

  freight         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (freight       >= 0),
  tax             NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax           >= 0),
  other_charges   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (other_charges >= 0),
  -- Recorded but NOT a cost of sale: deposits come back when the empties do.
  deposits        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deposits      >= 0),

  -- What the paper says. Stored to reconcile against, never used to compute.
  invoice_total   NUMERIC(12,2),

  notes           TEXT,
  -- Which shipments to re-check when the model or its prompt changes.
  source          TEXT        NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('ai_paste', 'manual')),

  -- Voiding reverses the stock and the cost effect without destroying the
  -- record. A posted document that can be deleted outright is how a P&L
  -- quietly changes with nothing to point at.
  voided_at       TIMESTAMPTZ,
  voided_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_shipments_org_date
  ON inventory_shipments(organization_id, invoice_date DESC);

ALTER TABLE inventory_shipments ENABLE ROW LEVEL SECURITY;

-- Postgres has no CREATE POLICY IF NOT EXISTS; dropping first keeps this
-- migration safe to run more than once.
DROP POLICY IF EXISTS "org_members_read_inventory_shipments"  ON inventory_shipments;
DROP POLICY IF EXISTS "org_members_write_inventory_shipments" ON inventory_shipments;

CREATE POLICY "org_members_read_inventory_shipments"
  ON inventory_shipments FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "org_members_write_inventory_shipments"
  ON inventory_shipments FOR ALL
  USING (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
  );

-- ── The two columns a delivery row is missing ────────────────────────────────
--
-- Both NULLABLE, and that is the entire backward-compatibility story: every
-- delivery already recorded has unit_cost NULL and keeps the valuation it has
-- today. Nothing already reported moves.
--
-- usage_logs predates this repo's migration set and its DDL is not readable
-- from source here, so this touches nothing but the two new columns.
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS shipment_id UUID REFERENCES inventory_shipments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_cost   NUMERIC(12,4);

COMMENT ON COLUMN usage_logs.unit_cost IS
  'Dollars per stock unit actually paid on this movement. NULL means no invoice '
  'recorded it, and the books fall back to inventory_items.cost_price.';

-- SET NULL, not CASCADE: deleting a shipment record must never delete the stock
-- movements it caused. Voiding is the supported path.
CREATE INDEX IF NOT EXISTS idx_usage_logs_shipment
  ON usage_logs(shipment_id)
  WHERE shipment_id IS NOT NULL;
```

- [ ] **Step 2: Verify the SQL parses**

There is no local Postgres in this repo, so this is a review step, not a run step. Re-read the file and confirm:
- every `CREATE`/`ALTER` is `IF NOT EXISTS` or preceded by `DROP ... IF EXISTS`
- no statement other than the final `ALTER TABLE usage_logs` mentions `usage_logs`
- the RLS policies match `20260818000000_add_cost_classification.sql`'s `operating_expenses` policies word for word apart from the table name

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260824000000_add_inventory_shipments.sql
git commit -m "feat(inventory): shipments table and per-movement unit cost"
```

---

### Task 2: Pure arithmetic — charge allocation

**Files:**
- Create: `lib/inventory/shipments.ts`
- Test: `lib/inventory/shipments.test.ts`

**Interfaces:**
- Consumes: `CostType` from `@/lib/books/cost-structure` (`'beverage_cogs' | 'food_cogs' | 'supplies' | 'excluded'`).
- Produces:
  ```ts
  export type ShipmentLine = { costType: CostType; lineTotal: number };
  export type ShipmentCharges = { freight: number; tax: number; otherCharges: number };
  export function allocateShipmentCharges(
    lines: ShipmentLine[],
    charges: ShipmentCharges,
  ): { byLine: number[]; unallocated: number };
  ```

- [ ] **Step 1: Write the failing tests**

Create `lib/inventory/shipments.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { allocateShipmentCharges } from './shipments';

/**
 * Freight, tax and other charges are invoice-level, but pour cost is measured
 * per category. Dumping all of an invoice's freight into beverage would inflate
 * the one ratio the whole cost_type split exists to protect.
 */
describe('allocateShipmentCharges', () => {
  const bev = (lineTotal: number) => ({ costType: 'beverage_cogs' as const, lineTotal });
  const sup = (lineTotal: number) => ({ costType: 'supplies' as const, lineTotal });
  const none = { freight: 0, tax: 0, otherCharges: 0 };

  it('splits a charge by each line’s share of the value', () => {
    // 300 and 100 -> 3:1, so $40 of freight goes 30/10.
    const r = allocateShipmentCharges([bev(300), sup(100)], { ...none, freight: 40 });
    expect(r.byLine[0]).toBeCloseTo(30);
    expect(r.byLine[1]).toBeCloseTo(10);
    expect(r.unallocated).toBeCloseTo(0);
  });

  it('adds every kind of charge together', () => {
    const r = allocateShipmentCharges([bev(100)], { freight: 10, tax: 5, otherCharges: 2.5 });
    expect(r.byLine[0]).toBeCloseTo(17.5);
  });

  it('conserves the charge total to the cent', () => {
    const r = allocateShipmentCharges(
      [bev(33.33), bev(33.33), sup(33.34)],
      { ...none, freight: 10 },
    );
    const spread = r.byLine.reduce((t, v) => t + v, 0);
    expect(spread + r.unallocated).toBeCloseTo(10, 6);
  });

  it('reports the whole charge as unallocated when there are no lines', () => {
    // An all-freight credit note, or a half-entered invoice. Silently dropping
    // the money would understate costs with nothing on screen to notice.
    const r = allocateShipmentCharges([], { ...none, freight: 25 });
    expect(r.byLine).toEqual([]);
    expect(r.unallocated).toBeCloseTo(25);
  });

  it('reports the charge as unallocated when every line is worth nothing', () => {
    // Dividing by a zero total would produce NaN and poison the P&L.
    const r = allocateShipmentCharges([bev(0), sup(0)], { ...none, freight: 25 });
    expect(r.byLine).toEqual([0, 0]);
    expect(r.unallocated).toBeCloseTo(25);
  });

  it('allocates nothing when there is nothing to allocate', () => {
    const r = allocateShipmentCharges([bev(100), sup(50)], none);
    expect(r.byLine).toEqual([0, 0]);
    expect(r.unallocated).toBe(0);
  });

  it('ignores a negative or unreadable line value rather than inverting a share', () => {
    const r = allocateShipmentCharges(
      [bev(100), sup(Number.NaN), bev(-50)],
      { ...none, freight: 10 },
    );
    expect(r.byLine[0]).toBeCloseTo(10);
    expect(r.byLine[1]).toBe(0);
    expect(r.byLine[2]).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/inventory/shipments.test.ts`
Expected: FAIL — `Failed to resolve import "./shipments"`.

- [ ] **Step 3: Write the implementation**

Create `lib/inventory/shipments.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/inventory/shipments.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/inventory/shipments.ts lib/inventory/shipments.test.ts
git commit -m "feat(inventory): allocate invoice charges across shipment lines"
```

---

### Task 3: Pure arithmetic — price changes and reconciliation

**Files:**
- Modify: `lib/inventory/shipments.ts`
- Test: `lib/inventory/shipments.test.ts`

**Interfaces:**
- Consumes: `ShipmentCharges` from Task 2.
- Produces:
  ```ts
  export type PriceChange = { from: number; to: number; pctChange: number; needsConfirm: boolean };
  export const PRICE_CHANGE_THRESHOLD = 0.10;
  export function flagPriceChanges(
    lines: Array<{ itemId: string | null; quantity: number; unitCost: number | null }>,
    currentCosts: Map<string, number>,
    threshold?: number,
  ): Map<string, PriceChange>;

  export function reconcileTotal(
    lines: Array<{ lineTotal: number }>,
    charges: ShipmentCharges & { deposits: number },
    invoiceTotal: number | null,
  ): { computed: number; stated: number | null; difference: number; matches: boolean };
  ```

- [ ] **Step 1: Write the failing tests**

Append to `lib/inventory/shipments.test.ts` (and extend the import at the top of the file to `import { allocateShipmentCharges, flagPriceChanges, reconcileTotal, PRICE_CHANGE_THRESHOLD } from './shipments';`):

```ts
/**
 * The model reads the numbers, so one mis-parsed digit can reprice the bar.
 * A big move is not rejected — distributors really do raise prices — it is
 * held for a human to confirm.
 */
describe('flagPriceChanges', () => {
  const costs = new Map([['tito', 21.10], ['jame', 19.85]]);
  const line = (itemId: string | null, quantity: number, unitCost: number | null) =>
    ({ itemId, quantity, unitCost });

  it('applies a small rise without asking', () => {
    const r = flagPriceChanges([line('tito', 6, 22.40)], costs);
    expect(r.get('tito')!.needsConfirm).toBe(false);
    expect(r.get('tito')!.to).toBeCloseTo(22.40);
  });

  it('holds a large rise for confirmation', () => {
    const r = flagPriceChanges([line('tito', 6, 40.00)], costs);
    expect(r.get('tito')!.needsConfirm).toBe(true);
  });

  it('holds a large FALL for confirmation too', () => {
    // $45.00 read as $4.50 is the characteristic model slip, and it is a
    // decrease — a rise-only guard would wave the worst case straight through.
    const r = flagPriceChanges([line('tito', 6, 4.50)], costs);
    expect(r.get('tito')!.needsConfirm).toBe(true);
    expect(r.get('tito')!.pctChange).toBeLessThan(0);
  });

  it('collapses two lines for one item into a quantity-weighted average', () => {
    // A split line, or two drops on one document. Taking whichever row came
    // last would make the new cost depend on the order the model emitted rows.
    const r = flagPriceChanges([line('tito', 6, 22.00), line('tito', 2, 30.00)], costs);
    // (6*22 + 2*30) / 8 = 24.00
    expect(r.get('tito')!.to).toBeCloseTo(24.0);
  });

  it('does not treat an item with no stored cost as a jump', () => {
    const r = flagPriceChanges([line('newitem', 3, 12.00)], costs);
    expect(r.get('newitem')!.needsConfirm).toBe(false);
    expect(r.get('newitem')!.from).toBe(0);
  });

  it('skips lines with no matched item', () => {
    const r = flagPriceChanges([line(null, 3, 12.00)], costs);
    expect(r.size).toBe(0);
  });

  it('skips lines with no price, rather than zeroing the item’s cost', () => {
    const r = flagPriceChanges([line('tito', 6, null)], costs);
    expect(r.size).toBe(0);
  });

  it('leaves an unchanged price unflagged', () => {
    const r = flagPriceChanges([line('jame', 12, 19.85)], costs);
    expect(r.get('jame')!.needsConfirm).toBe(false);
    expect(r.get('jame')!.pctChange).toBeCloseTo(0);
  });

  it('uses ten percent as the threshold', () => {
    expect(PRICE_CHANGE_THRESHOLD).toBe(0.10);
  });
});

/**
 * "Does this tie to the paper" and "what did the beer cost" are two different
 * questions. Deposits are billed on the invoice, so they belong in the first
 * and not the second.
 */
describe('reconcileTotal', () => {
  const noCharges = { freight: 0, tax: 0, otherCharges: 0, deposits: 0 };

  it('adds lines and charges and compares to the stated total', () => {
    const r = reconcileTotal(
      [{ lineTotal: 134.40 }, { lineTotal: 238.20 }],
      { ...noCharges, freight: 18.0 },
      390.60,
    );
    expect(r.computed).toBeCloseTo(390.60);
    expect(r.matches).toBe(true);
    expect(r.difference).toBeCloseTo(0);
  });

  it('INCLUDES deposits, so a deposit-bearing invoice ties to the paper', () => {
    // Deposits are excluded from cost of sales but they are still money on the
    // invoice. Subtracting here made every keg invoice read as short.
    const r = reconcileTotal([{ lineTotal: 100 }], { ...noCharges, deposits: 7.20 }, 107.20);
    expect(r.matches).toBe(true);
  });

  it('flags a shortfall and says how big it is', () => {
    const r = reconcileTotal([{ lineTotal: 100 }], noCharges, 118.0);
    expect(r.matches).toBe(false);
    expect(r.difference).toBeCloseTo(-18.0);
  });

  it('tolerates a cent of rounding', () => {
    const r = reconcileTotal([{ lineTotal: 100.004 }], noCharges, 100.0);
    expect(r.matches).toBe(true);
  });

  it('reports nothing to check when no total was stated', () => {
    const r = reconcileTotal([{ lineTotal: 100 }], noCharges, null);
    expect(r.stated).toBeNull();
    expect(r.matches).toBe(true);
    expect(r.difference).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/inventory/shipments.test.ts`
Expected: FAIL — `flagPriceChanges is not a function` and `reconcileTotal is not a function`. The Task 2 tests still pass.

- [ ] **Step 3: Write the implementation**

Append to `lib/inventory/shipments.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/inventory/shipments.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add lib/inventory/shipments.ts lib/inventory/shipments.test.ts
git commit -m "feat(inventory): flag price jumps and reconcile invoice totals"
```

---

### Task 4: The Groq shipment parser

**Files:**
- Create: `lib/ai-parsers/parse-shipment-with-ai.ts`

**Interfaces:**
- Consumes: `AIParsedInventoryItem` from `./parse-inventory-with-ai` (`{ name, quantity, unit, cost_price, category, sku }`); guardrails from `./guardrails`.
- Produces:
  ```ts
  export interface AIParsedShipment {
    vendor_name: string | null;
    invoice_number: string | null;
    invoice_date: string | null;   // YYYY-MM-DD
    freight: number | null;
    tax: number | null;
    deposits: number | null;
    other_charges: number | null;
    invoice_total: number | null;
    items: AIParsedInventoryItem[];
  }
  export function parseShipmentWithAI(text: string): Promise<AIParsedShipment>;
  ```

**Why a new file rather than extending `parse-inventory-with-ai.ts`:** that parser's prompt says *"Skip totals rows, tax lines, shipping charges"* — exactly the rows a shipment needs. Changing it in place would degrade the plain inventory import it already serves.

- [ ] **Step 1: Read the existing parser and its guardrails**

Read `lib/ai-parsers/parse-inventory-with-ai.ts` and `lib/ai-parsers/guardrails.ts` in full before writing. The new parser reuses the item shape, the model (`llama-3.3-70b-versatile`), `temperature: 0`, `response_format: { type: 'json_object' }`, and the same `MAX_MODEL_INPUT_CHARS` cap and `AiUnavailableError` handling. Match the surrounding style rather than inventing a new one.

- [ ] **Step 2: Write the parser**

Create `lib/ai-parsers/parse-shipment-with-ai.ts`:

```ts
import Groq from 'groq-sdk';
import type { AIParsedInventoryItem } from './parse-inventory-with-ai';
import { MAX_MODEL_INPUT_CHARS, AiUnavailableError } from './guardrails';

const client = new Groq();

/**
 * A supplier invoice, read off pasted text.
 *
 * Separate from parseInventoryWithAI because that prompt is told to SKIP totals,
 * tax and shipping rows — the exact lines a shipment has to capture. Teaching
 * one prompt both jobs would make it worse at each.
 *
 * Every field here is a SUGGESTION. Nothing reaches the database without
 * passing through the review step, and pasted text is attacker-controlled — see
 * guardrails.ts — so the server action validates all of it again with zod.
 */
export interface AIParsedShipment {
  vendor_name: string | null;
  invoice_number: string | null;
  /** YYYY-MM-DD. Null when the invoice does not say or the date is unreadable. */
  invoice_date: string | null;
  freight: number | null;
  tax: number | null;
  deposits: number | null;
  other_charges: number | null;
  invoice_total: number | null;
  items: AIParsedInventoryItem[];
}

const SYSTEM_PROMPT = `You are reading a supplier invoice or delivery receipt for a bar or restaurant.

Return ONLY a valid JSON object. No explanation, no markdown, no code fences.

{
  "vendor_name": string|null,     // the supplier/distributor, e.g. "Southern Glazer's"
  "invoice_number": string|null,  // invoice or document number
  "invoice_date": string|null,    // YYYY-MM-DD
  "freight": number|null,         // delivery/fuel/shipping charge in USD
  "tax": number|null,             // sales tax in USD
  "deposits": number|null,        // bottle/keg deposits in USD
  "other_charges": number|null,   // any other invoice-level charge in USD
  "invoice_total": number|null,   // the grand total printed on the invoice
  "items": [
    {
      "name": string,            // product name, cleaned up
      "quantity": number,        // units received — default 1 if unclear
      "unit": string,            // "bottle", "can", "keg", "case", "each", ...
      "cost_price": number|null, // per-unit cost in USD
      "category": string|null,   // "Spirits", "Beer", "Wine", "Mixers", "Supplies", ...
      "sku": string|null
    }
  ]
}

Rules:
- One entry in "items" per product line ONLY. Freight, tax, deposits and totals
  are invoice-level fields above, never items.
- cost_price is PER UNIT — divide the line total by the quantity if the invoice
  shows only a line total.
- Never invent a value. If the invoice does not show it, use null.
- invoice_total is what is printed, even if it does not match the lines. Do not
  compute it yourself — a mismatch is something the operator needs to see.
- For alcohol infer category from type (vodka/gin/rum/whiskey/tequila -> Spirits,
  IPA/lager/stout -> Beer, chardonnay/cabernet/rose -> Wine). Napkins, straws,
  cups, cleaning chemicals -> Supplies.
- Return "items": [] if no product lines can be identified.`;

/** Reads a number the model may have returned as a string, or not at all. */
function num(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Accepts only a real YYYY-MM-DD. A malformed date must not reach a DATE column. */
function isoDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    ? raw
    : null;
}

function str(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

export async function parseShipmentWithAI(text: string): Promise<AIParsedShipment> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set. Get a free key at console.groq.com and add it to .env.local.');
  }

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Read this supplier invoice:\n\n${text.slice(0, MAX_MODEL_INPUT_CHARS)}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
  } catch {
    // The provider failing is not the operator's file being wrong, and telling
    // them to fix a good file is the least useful thing we could say.
    throw new AiUnavailableError();
  }

  const raw = completion.choices[0]?.message?.content ?? '';

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('Could not read that invoice — check the text you pasted, or enter it by hand.');
  }

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];

  return {
    vendor_name: str(parsed.vendor_name),
    invoice_number: str(parsed.invoice_number),
    invoice_date: isoDate(parsed.invoice_date),
    freight: num(parsed.freight),
    tax: num(parsed.tax),
    deposits: num(parsed.deposits),
    other_charges: num(parsed.other_charges),
    invoice_total: num(parsed.invoice_total),
    items: rawItems.map((row) => {
      const r = row as Record<string, unknown>;
      const quantity = Number(r.quantity);
      return {
        name: String(r.name ?? '').trim(),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit: str(r.unit) ?? 'each',
        cost_price: num(r.cost_price),
        category: str(r.category),
        sku: str(r.sku),
      };
    }).filter((item) => item.name !== ''),
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If `MAX_MODEL_INPUT_CHARS` or `AiUnavailableError` are not exported from `guardrails.ts` under those names, read the file and use the real ones rather than adding exports.

- [ ] **Step 4: Commit**

```bash
git add lib/ai-parsers/parse-shipment-with-ai.ts
git commit -m "feat(inventory): Groq parser for supplier invoices"
```

---

### Task 5: Server actions — parse, post, void

**Files:**
- Create: `app/(app)/app/inventory/shipment-actions.ts`

**Interfaces:**
- Consumes: `parseShipmentWithAI` (Task 4); `flagPriceChanges` (Task 3); `canEditInventory` from `@/lib/permissions`; `getCurrentOrg` from `@/lib/org`; `createAdminClient` from `@/lib/supabase/admin`.
- Produces:
  ```ts
  export type ShipmentReviewLine = {
    name: string; quantity: number; unit: string;
    unitCost: number | null; category: string | null; sku: string | null;
    existingId: string | null; currentCost: number | null;
  };
  export type ShipmentReview = { header: {...}; lines: ShipmentReviewLine[] };
  export function parseShipmentText(text: string): Promise<ShipmentReview>;
  export function postShipment(raw: unknown): Promise<{ shipmentId: string; linesPosted: number }>;
  export function voidShipment(shipmentId: string): Promise<void>;
  export function listShipments(limit?: number): Promise<ShipmentSummary[]>;
  ```

- [ ] **Step 1: Read the patterns this file must follow**

Read, in this order:
- `app/(app)/app/books/expense-actions.ts` — zod schema shape, `canEditInventory` gate, `revalidatePath`
- `app/(app)/app/inventory/actions.ts:355-430` — `resolveCategoryId`, item create/update, the `usage_logs` delivery insert
- `app/(app)/app/inventory/weigh/actions.ts:1-60` — `assertReportInOrg`, the parent-scoping pattern this file must copy for shipment lines

- [ ] **Step 2: Write the actions file**

Create `app/(app)/app/inventory/shipment-actions.ts`. It must contain, in this order:

1. `'use server'` and imports.
2. A zod schema. Bounds are not decoration — these land in a financial statement:
   ```ts
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
   ```
3. `parseShipmentText(text)`: gate on `canEditInventory`, call `parseShipmentWithAI`, then match each parsed item to an existing inventory item by exact lowercased name, falling back to SKU. Load candidates with one scoped query:
   ```ts
   const { data: existing } = await supabase
     .from('inventory_items')
     .select('id, name, sku, cost_price')
     .eq('organization_id', org.id);
   ```
   Return `ShipmentReview` with `existingId` and `currentCost` filled where matched. **No writes.**
4. `postShipment(raw)`: gate, `shipmentSchema.parse(raw)`, then:
   - insert the `inventory_shipments` row (with `organization_id: org.id`, `created_by: user.id`), select `id`
   - for each line: resolve or create the item (copy `resolveCategoryId` from `inventory/actions.ts`; do not import it — it is a closure over `catMap` and `supabase` inside another function), then update `current_stock` by `+quantity`, and set `cost_price` only when `applyCost` is true and `unitCost` is not null
   - insert one `usage_logs` row per line: `{ organization_id: org.id, item_id, quantity, reason: 'delivery', unit_cost: line.unitCost, shipment_id, note: 'Shipment ' + (invoiceNumber ?? vendorName) }`
   - `revalidatePath('/app/inventory')`, `revalidatePath('/app/inventory/shipments')`, `revalidatePath('/app/books')`
5. `voidShipment(shipmentId)`: gate, then verify the shipment belongs to the org **before touching anything hanging off it** — the `assertReportInOrg` pattern:
   ```ts
   const { data: shipment } = await supabase
     .from('inventory_shipments')
     .select('id')
     .eq('id', shipmentId)
     .eq('organization_id', org.id)
     .maybeSingle();
   if (!shipment) throw new Error('Shipment not found');
   ```
   Then set `voided_at`/`voided_by`, read that shipment's delivery rows, and for each insert an offsetting `usage_logs` row with `reason: 'recount'`, a note naming the void, and `unit_cost: null`, decrementing `current_stock`. Cost prices are **not** rolled back — a later invoice may already have moved them, and guessing which is worse than leaving them.
6. `listShipments(limit = 50)`: scoped select ordered by `invoice_date DESC`, joined to a count of its delivery rows.

Every `createAdminClient()` query above carries `.eq('organization_id', org.id)`. The per-line `inventory_items` and `usage_logs` writes inside `postShipment` are reached by ids resolved from scoped queries in the same function — mark each with:
```ts
// admin-scope-ok: `itemId` was resolved above from a query filtered by
// .eq('organization_id', org.id), so it is always in-org.
```

- [ ] **Step 3: Verify tenancy and types**

```bash
npm run audit:scope
npx tsc --noEmit
```
Expected: `audit:scope` reports `unscoped and unjustified : 0`; typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/app/inventory/shipment-actions.ts"
git commit -m "feat(inventory): parse, post and void shipment actions"
```

---

### Task 6: The books read the real price

**Files:**
- Modify: `app/(app)/app/books/actions.ts` (the `usage_logs` select ~line 86 and the `costedUsage` map ~line 140)

**Interfaces:**
- Consumes: `usage_logs.unit_cost` (Task 1); `allocateShipmentCharges` (Task 2).
- Produces: nothing new. `CostedUsage`, `summariseCosts` and `buildProfitAndLoss` are untouched.

**This is the smallest edit with the largest blast radius.** It changes reported COGS. Review it hardest.

- [ ] **Step 1: Add `unit_cost` and `shipment_id` to the query**

In `app/(app)/app/books/actions.ts`, the `usage_logs` select becomes:

```ts
    supabase
      .from('usage_logs')
      // cost_type comes through the item's category: it decides whether this
      // purchase is cost of goods, an operating supply, or ignored entirely.
      // unit_cost is what the invoice actually charged; NULL for every delivery
      // recorded before shipments existed, which is why the fallback stays.
      .select('quantity, reason, logged_at, unit_cost, shipment_id, inventory_items(cost_price, inventory_categories(cost_type))')
      .eq('organization_id', orgId)
      .eq('reason', 'delivery')
      .gte('logged_at', startDate + 'T00:00:00Z')
      .lte('logged_at', endDate + 'T23:59:59Z'),
```

- [ ] **Step 2: Value each line from the invoice when there is one**

The `costedUsage` map becomes:

```ts
  // Every purchase carries its category's classification, so napkins land in
  // supplies rather than inflating pour cost. See lib/books/cost-structure.ts.
  //
  // unit_cost is what the invoice charged. Falling back to the item's current
  // cost_price is what every delivery did before shipments existed — and is
  // also why editing an item used to restate history: with no record of what a
  // delivery cost, last month's purchases were re-priced at today's price.
  const costedUsage: CostedUsage[] = logs.map((l) => ({
    costType: getCostType(l.inventory_items),
    value: (l.quantity ?? 0) * (l.unit_cost ?? getCostPrice(l.inventory_items)),
  }));
```

- [ ] **Step 3: Fold in allocated invoice charges**

After `costedUsage`, add — importing `allocateShipmentCharges` from `@/lib/inventory/shipments`:

```ts
  // Freight and tax are invoice-level but pour cost is per category, so each
  // shipment's charges are spread across its own lines by share of value. A
  // case of napkins on a liquor invoice must not carry the same freight as ten
  // cases of spirits. Deposits are excluded — they come back.
  const { data: shipmentCharges } = await supabase
    .from('inventory_shipments')
    .select('id, freight, tax, other_charges')
    .eq('organization_id', orgId)
    .is('voided_at', null)
    .gte('invoice_date', startDate)
    .lte('invoice_date', endDate);

  const chargedUsage: CostedUsage[] = [];
  for (const shipment of shipmentCharges ?? []) {
    const shipmentLines = logs
      .filter((l) => l.shipment_id === shipment.id)
      .map((l) => ({
        costType: getCostType(l.inventory_items),
        lineTotal: (l.quantity ?? 0) * (l.unit_cost ?? getCostPrice(l.inventory_items)),
      }));

    const { byLine } = allocateShipmentCharges(shipmentLines, {
      freight: Number(shipment.freight) || 0,
      tax: Number(shipment.tax) || 0,
      otherCharges: Number(shipment.other_charges) || 0,
    });

    byLine.forEach((value, i) => {
      if (value > 0) chargedUsage.push({ costType: shipmentLines[i].costType, value });
    });
  }

  const costs = summariseCosts(
    [...costedUsage, ...chargedUsage],
    expandRecurring(rawExpenses, startDate, endDate),
  );
```

Replace the existing `summariseCosts(costedUsage, ...)` call with the one above.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npm run audit:scope
npm test
```
Expected: typecheck clean; `unscoped and unjustified : 0`; 294+ tests pass.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/app/books/actions.ts"
git commit -m "feat(books): value purchases from the invoice, not today's cost price"
```

---

### Task 7: Shipments route and list

**Files:**
- Create: `app/(app)/app/inventory/shipments/page.tsx`
- Create: `app/(app)/app/inventory/shipments/_components/shipment-list.tsx`
- Modify: `app/(app)/app/_components/nav-config.ts:59-66`

**Interfaces:**
- Consumes: `listShipments` (Task 5).
- Produces: the route `/app/inventory/shipments`.

- [ ] **Step 1: Add the nav tab**

In `app/(app)/app/_components/nav-config.ts`, the Stock group's `tabs` array gains a Shipments entry after Weigh (import `Truck` from `lucide-react`):

```ts
      { label: 'Items',     href: '/app/inventory',           icon: Package },
      { label: 'Weigh',     href: '/app/inventory/weigh',     icon: Scale },
      { label: 'Shipments', href: '/app/inventory/shipments', icon: Truck },
```

- [ ] **Step 2: Write the server page**

Create `app/(app)/app/inventory/shipments/page.tsx`. It must:
- `export const metadata: Metadata = { title: 'Shipments' };`
- start with `const { org, role } = await getCurrentOrg();`
- call `listShipments()` and render `<ShipmentList shipments={...} canEdit={canEditInventory(role)} />`

- [ ] **Step 3: Write the list component**

Create `app/(app)/app/inventory/shipments/_components/shipment-list.tsx` — a client component rendering date, vendor, invoice number, line count, total, and a voided badge, using `components/ui/table`. Include an empty state that explains what the screen is for and opens the log dialog. Wire the dialog in Task 8.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npm run build
```
Expected: typecheck clean; build compiles and lists `/app/inventory/shipments` as a route.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/app/inventory/shipments" "app/(app)/app/_components/nav-config.ts"
git commit -m "feat(inventory): shipments route and list"
```

---

### Task 8: Log-a-shipment dialog

**Files:**
- Create: `app/(app)/app/inventory/shipments/_components/log-shipment-dialog.tsx`
- Modify: `app/(app)/app/inventory/shipments/_components/shipment-list.tsx` (wire the button)

**Interfaces:**
- Consumes: `parseShipmentText`, `postShipment` (Task 5); `flagPriceChanges`, `reconcileTotal`, `PRICE_CHANGE_THRESHOLD` (Task 3).
- Produces: nothing further.

- [ ] **Step 1: Read the dialog this one mirrors**

Read `app/(app)/app/inventory/_components/inventory-import-dialog.tsx` in full. It already has the exact state machine (`idle → parsing → review → importing → done`), the paste textarea, and the per-row editable review table. Follow it rather than inventing a second pattern. Remember `components/ui` is **Base UI**: controlled `<Dialog open onOpenChange>`, `render` instead of `asChild`.

- [ ] **Step 2: Build the three states**

- **idle** — textarea plus a "Read invoice" button calling `parseShipmentText`.
- **review** — the step that earns the feature:
  - header fields (vendor, invoice number, invoice date, freight, tax, deposits, other charges, stated total), each AI-prefilled and editable
  - one row per line: matched item name or "create new", quantity, unit cost, computed line total
  - `flagPriceChanges(...)` run over the lines on every edit. The review line
    type from Task 5 names these fields differently, so bridge them explicitly:

    ```ts
    const changes = flagPriceChanges(
      lines.map((l) => ({ itemId: l.existingId, quantity: l.quantity, unitCost: l.unitCost })),
      new Map(
        lines
          .filter((l) => l.existingId && l.currentCost != null)
          .map((l) => [l.existingId as string, l.currentCost as number]),
      ),
    );
    ```

    Any entry with `needsConfirm` renders the old and new price and a checkbox
    that sets that line's `applyCost`. **A line needing confirmation blocks
    posting until it is ticked or its price is corrected.**
  - `reconcileTotal(lines.map((l) => ({ lineTotal: l.quantity * (l.unitCost ?? 0) })), { freight, tax, otherCharges, deposits }, invoiceTotal)`
    shown live as either "Ties to the invoice" or "$18.00 short of the invoice
    total" — visible *before* posting, since afterwards it is a wrong pour cost
    next month rather than a number on screen
- **done** — lines posted, stock moved, with a link back to the list.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npm run lint
npm run build
```
Expected: typecheck clean; no new lint findings in the files you touched (the repo has ~63 pre-existing ones elsewhere — compare against `git stash` output if unsure); build compiles.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/app/inventory/shipments/_components"
git commit -m "feat(inventory): log a shipment from pasted invoice text"
```

---

### Task 9: Inventory dashboard shows the real document

**Files:**
- Modify: `app/(app)/app/inventory/_components/inventory-dashboard.tsx:129-131`

**Interfaces:**
- Consumes: `listShipments` (Task 5).
- Produces: nothing.

- [ ] **Step 1: Read the current panel**

`inventory-dashboard.tsx` derives a "latest shipment" by filtering `usageLogs` for `reason === 'delivery'` and grouping by day (~line 129). That inference is only needed where no shipment record exists.

- [ ] **Step 2: Prefer the real shipment**

When a shipment exists for the most recent delivery date, show its vendor and invoice total. Otherwise keep today's grouped-by-day inference verbatim, so bars that never log a shipment see exactly what they see now.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit && npm run build
git add "app/(app)/app/inventory/_components/inventory-dashboard.tsx"
git commit -m "feat(inventory): dashboard shows the logged shipment when there is one"
```

---

### Task 10: Document the feature

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-08-24-inventory-shipments-design.md` (status line)

- [ ] **Step 1: Add a short section to AGENTS.md**

Under the data-access notes, following the house style of stating the invariant and why:

```markdown
**A delivery's cost is recorded, not inferred.** `usage_logs.unit_cost` is what the
invoice charged, in stock units; `shipment_id` links the movement to its
`inventory_shipments` document. Both are NULL for every delivery recorded before
shipments existed, and the books fall back to `inventory_items.cost_price` for
those — which is why editing an item's cost used to restate past months. Anything
valuing a purchase must read `unit_cost ?? cost_price`, never `cost_price` alone.
Invoice-level freight and tax are allocated across a shipment's own lines by
share of value (`lib/inventory/shipments.ts`); deposits are recorded but are not
a cost of sale.
```

- [ ] **Step 2: Update the spec status**

Change the spec's status line to `**Status:** BUILT (<date>).`

- [ ] **Step 3: Full verification**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run audit:scope
npm run build
```
Expected: all pass; `audit:scope` reports 0 unscoped; no new lint findings in touched files.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/superpowers/specs/2026-08-24-inventory-shipments-design.md
git commit -m "docs: record how shipment costs are valued"
```

---

## Release note

**Pour cost will move.** Once shipments carry real prices, a period containing
them will not report the same COGS it reported last week. That is the feature
working, but anyone reading the P&L needs to be told, or it reads as a
regression.
