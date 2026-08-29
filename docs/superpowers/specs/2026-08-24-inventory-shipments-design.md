# Inventory shipments: logging what a delivery actually cost

**Status:** BUILT (2026-08-25).
**Date:** 2026-08-24

Log a liquor delivery as the invoice it is — vendor, invoice number, real line
prices, freight — instead of inferring its value from whatever an item's cost
price happens to say today. Entry is AI-first: paste the invoice text, the model
extracts it, the operator fills the gaps.

---

## What already exists

This is not a greenfield feature, and most of the request is already half-built.

| Already there | Where |
|---|---|
| Deliveries are logged — `usage_logs` rows with `reason = 'delivery'`, **quantity only** | `app/(app)/app/inventory/actions.ts:401` |
| The books are **already purchase-based**: they read delivery rows, not consumption | `app/(app)/app/books/actions.ts:87-90` |
| Purchases classified beverage / food / supplies / excluded, at the category level | `inventory_categories.cost_type`, migration `20260818000000` |
| Costs that never touch inventory (DJ, repairs, licences) | `operating_expenses` + `books/expense-actions.ts` |
| AI invoice parsing — name, quantity, unit, cost_price, category, SKU | `lib/ai-parsers/parse-inventory-with-ai.ts` |
| Paste-or-upload → parse → review → commit UI | `inventory/_components/inventory-import-dialog.tsx` |
| Reps and purchase orders — items with quantities, **no prices**, status to `delivered` | `rep_orders`, migration `add_reps.sql` |

## The actual gap

**No shipment ever records what the bar was charged.** The books value a
delivery as `quantity × inventory_items.cost_price` — the item's *current*
price. Four consequences:

1. A price rise is invisible until somebody hand-edits the item.
2. Freight, tax and bottle deposits have nowhere to live at all.
3. Nothing reconciles against the distributor's paperwork — there is no stored
   total to compare to.
4. **Editing an item's cost price silently restates every past month.** The
   categories dialog already warns about this class of problem in its own copy
   (`categories-dialog.tsx:224`), but the delivery valuation has the same flaw
   and no warning.

Point 4 is a live correctness bug, not merely a missing feature.

---

## Decisions taken (from brainstorming, 2026-08-24)

| Question | Decision |
|---|---|
| Input medium | **Paste text only.** No photo, no PDF. Reuses today's Groq text model. |
| Non-liquor materials (napkins, cups, cleaning) | **Tracked as inventory items**, in categories classified `supplies`. No untracked cost-only lines. |
| Price differs from stored cost | **Update, but flag jumps over 10%** in review for confirmation. |
| P&L shape | Unchanged. The books stay purchase-based; only the *valuation* becomes accurate. |

---

## Data model

### A shipment line IS a delivery movement

The load-bearing decision. A `usage_logs` delivery row already carries item,
quantity, and date; what it lacks is the price and a link to the document. So
there is **no separate line-items table** — adding one would create two records
of the same event that can disagree, and the stock movement and the money would
drift apart exactly the way the payroll engine and the Day Split screen did
before `lib/payroll/tip-pool.ts` was extracted.

### New table: `inventory_shipments`

The invoice as a document.

```sql
CREATE TABLE IF NOT EXISTS inventory_shipments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Either a known rep, or just a name. A bar buys from vendors it has never
  -- created a rep record for, and forcing one first would stop the entry.
  rep_id          UUID        REFERENCES reps(id) ON DELETE SET NULL,
  vendor_name     TEXT        NOT NULL,

  invoice_number  TEXT,
  invoice_date    DATE        NOT NULL,
  received_date   DATE,

  -- Invoice-level charges, allocated across the lines. See "Charges" below.
  freight         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (freight        >= 0),
  tax             NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax            >= 0),
  other_charges   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (other_charges  >= 0),
  -- Recorded but NOT a cost of sale: deposits come back.
  deposits        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deposits       >= 0),

  -- What the paper says. Stored to reconcile against, never used to compute.
  invoice_total   NUMERIC(12,2),

  notes           TEXT,
  -- 'ai_paste' | 'manual'. Which shipments to re-check when a prompt changes.
  source          TEXT        NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('ai_paste', 'manual')),

  -- Voiding reverses stock and cost effect without destroying the record.
  voided_at       TIMESTAMPTZ,
  voided_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_shipments_org_date
  ON inventory_shipments(organization_id, invoice_date DESC);
```

RLS mirrors `operating_expenses` exactly — read and write both gated on
`organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())`,
with `DROP POLICY IF EXISTS` first so the migration is re-runnable.

### `usage_logs` gains two nullable columns

```sql
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS shipment_id UUID REFERENCES inventory_shipments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_cost   NUMERIC(12,4);
```

**Both nullable, and that is the whole backward-compatibility story.** Every
existing delivery row has `unit_cost = NULL` and keeps its current valuation.

`usage_logs` predates this repo's migration set — its `reason` is a Postgres
ENUM (`usage_reason`) with no DDL in this repo, a fact that already broke an
earlier migration (see the warning in `20260817000003_add_pos_bundles_and_depletion.sql:167`).
The ALTER must therefore be `IF NOT EXISTS` and must not assume anything else
about the table's definition.

`ON DELETE SET NULL` rather than CASCADE: deleting a shipment record must never
delete the stock movements it caused. Voiding is the supported path.

---

## The books change

One expression, in `app/(app)/app/books/actions.ts` (~line 140):

```ts
// before
value: (l.quantity ?? 0) * getCostPrice(l.inventory_items),

// after
value: (l.quantity ?? 0) * (l.unit_cost ?? getCostPrice(l.inventory_items)),
```

plus `unit_cost` added to that query's `.select()`, and the allocated charges
folded in (below). `CostedUsage`, `summariseCosts`, `buildProfitAndLoss` and the
whole `lib/books/cost-structure.ts` P&L shape are untouched.

### Charges

Freight, tax and other charges are allocated **pro-rata across the shipment's
lines, weighted by line value**, so a mixed invoice splits its freight between
`beverage_cogs` and `supplies` in proportion rather than dumping all of it into
pour cost. Pour cost is the ratio the entire `cost_type` split exists to
protect (see the header comment of migration `20260818000000`), and freight is
a real part of landed cost — neither ignoring it nor lumping it all into
beverage is defensible.

Deposits are **excluded** from cost of sales. They are recoverable on return,
so counting them as a cost overstates COGS every month and understates it in
whatever month the empties go back.

A shipment with charges but no lines (an all-freight credit note, a mistake)
allocates nothing and is reported as an unallocated remainder rather than
being silently dropped.

---

## Pure, tested logic — `lib/inventory/shipments.ts`

Following the precedent of `lib/payroll/tip-pool.ts` and `lib/payroll/overtime.ts`:
the arithmetic that decides money lives in a pure module with vitest coverage,
and the server action does the I/O either side of it.

```ts
/** Spreads invoice-level charges across lines by share of line value. */
export function allocateShipmentCharges(
  lines: Array<{ costType: CostType; lineTotal: number }>,
  charges: { freight: number; tax: number; otherCharges: number },
): { byLine: number[]; unallocated: number };

/**
 * Which lines move an item's cost price, and which need confirming first.
 *
 * Keyed by inventory item id. Lines with no matched item are skipped — a
 * not-yet-created item has no stored cost to compare against and takes the
 * invoice price outright.
 *
 * When ONE invoice lists the same item more than once at different prices — a
 * split line, or two drops on one document — the lines are collapsed into a
 * quantity-weighted average for that item before comparing. Taking the last
 * line would make the new cost depend on the order the model happened to emit
 * rows in, which is not a basis for pricing anything.
 */
export function flagPriceChanges(
  lines: Array<{ itemId: string | null; quantity: number; unitCost: number | null }>,
  currentCosts: Map<string, number>,
  threshold?: number,   // default 0.10
): Map<string, { from: number; to: number; pctChange: number; needsConfirm: boolean }>;

/**
 * Line sum + every charge INCLUDING deposits, vs. the total the operator typed.
 *
 * Deposits are billed on the invoice, so they belong in this comparison even
 * though they are excluded from cost of sales. Those are two different
 * questions — "does this tie to the paper" and "what did the beer cost" — and
 * conflating them makes every deposit-bearing invoice read as short by exactly
 * the deposit.
 */
export function reconcileTotal(
  lines: Array<{ lineTotal: number }>,
  charges: { freight: number; tax: number; otherCharges: number; deposits: number },
  invoiceTotal: number | null,
): { computed: number; stated: number | null; difference: number; matches: boolean };
```

Test cases that must exist:

- allocation conserves the charge total to the cent, including when one line is zero-value
- allocation with no lines reports the whole charge as unallocated rather than losing it
- a mixed beverage/supplies invoice splits freight proportionally, not evenly
- price change under threshold applies silently; over threshold needs confirmation
- a **fall** of more than the threshold flags too — `$45.00` mis-read as `$4.50` is the
  characteristic AI failure and is a decrease, not an increase
- an item with no stored cost price is not treated as a 100% increase
- the same item on two lines at different prices collapses to a quantity-weighted
  average, not to whichever row came last
- reconciliation INCLUDES deposits, so a deposit-bearing invoice ties to the paper
- reconciliation tolerates rounding to within one cent and flags anything larger
- reconciliation with no stated total reports "nothing to check", not a mismatch of zero

---

## AI parsing — `lib/ai-parsers/parse-shipment-with-ai.ts`

A new parser rather than a change to `parse-inventory-with-ai.ts`, because the
existing one is used by the plain inventory import and its prompt explicitly
says *"Skip totals rows, tax lines, shipping charges"* — precisely the rows a
shipment needs. Changing it in place would degrade the import it already serves.

Returns a header plus lines:

```ts
{
  vendor_name: string | null,
  invoice_number: string | null,
  invoice_date: string | null,       // YYYY-MM-DD
  freight: number | null,
  tax: number | null,
  deposits: number | null,
  other_charges: number | null,
  invoice_total: number | null,
  items: AIParsedInventoryItem[],    // the existing shape, reused
}
```

It reuses `lib/ai-parsers/guardrails.ts` unchanged: the `MAX_MODEL_INPUT_CHARS`
cap, the rate limit, `AiUnavailableError` vs. a genuinely unreadable file. Same
model (`llama-3.3-70b-versatile`), `temperature: 0`, `response_format: json_object`.

**Every AI-supplied field is a suggestion, never a commit.** Nothing posts
without passing through review. Uploaded text is attacker-controlled — the
guardrails module says so explicitly — so parsed values are validated with zod
server-side on post, not merely on screen.

---

## UI

### New route `/app/inventory/shipments`

List: date, vendor, invoice number, line count, total, and a voided badge.
Follows the existing inventory route conventions — page-local components in
`_components/`, `getCurrentOrg()` at the top of the server page.

### Log-a-shipment dialog

Three states, mirroring `inventory-import-dialog.tsx`, which already has this
exact shape (`idle → parsing → review → importing → done`):

1. **Paste** — textarea, same as today.
2. **Review** — the step that earns the feature:
   - header fields, AI-prefilled, each editable
   - one row per line: matched item (or "create new"), quantity, unit cost, line total
   - **price jumps over 10% flagged** with the old and new figure, needing a tick
   - **running reconciliation**: line sum + charges vs. the stated invoice total,
     shown as you edit, so a mis-parsed line reads as "$18.00 short of the invoice"
     *before* posting rather than as a wrong pour cost next month
3. **Post** — one server action, described below.

### Inventory dashboard

`inventory-dashboard.tsx` already derives a "latest shipment" panel by
filtering `usage_logs` for `reason === 'delivery'` and grouping by day
(lines ~129-131). It should show the real document — vendor and invoice total —
when one exists, falling back to today's inferred grouping for older deliveries.

---

## Server actions — `app/(app)/app/inventory/shipment-actions.ts`

All gated on `canEditInventory(role)`, matching `books/expense-actions.ts`.

- `parseShipmentText(text)` → parsed header + lines. No writes.
- `postShipment(input)` → validated with zod, then, in order:
  1. insert `inventory_shipments`
  2. for each line: resolve or create the inventory item (reusing
     `resolveCategoryId`), add stock, insert the `usage_logs` delivery row with
     `shipment_id` and `unit_cost`
  3. apply cost-price updates for lines whose change was confirmed
- `voidShipment(id)` → sets `voided_at`, reverses each line's stock with an
  offsetting `usage_logs` row, and leaves the document readable.

### Tenancy

`createAdminClient()` bypasses RLS, so every query must filter
`.eq('organization_id', org.id)` by hand, and `npm run audit:scope` will fail
the build otherwise. Shipment lines reach `inventory_items` through
`shipment_id`, so the pattern is the one `assertItemInOrg` uses in
`inventory/weigh/actions.ts`: verify the parent shipment belongs to the org
before touching anything hanging off it, and justify the inner query with an
`admin-scope-ok:` comment naming the check that guarantees it.

---

## Explicitly out of scope

- **Reconciling against open `rep_orders`.** The quantities are already there
  and matching a delivery to its PO is the obvious next feature, but it is a
  separate flow with its own partial-delivery questions.
- **Photo and PDF invoices.** Decided: paste only. A vision model is a
  different capability with different failure modes.
- **Weighted-average costing.** Decided: latest price wins, with a confirmation
  gate.
- **Editing a posted shipment.** Void and re-enter. Editing a document that has
  already moved stock and restated the P&L needs a reversal model this does not
  have yet.

---

## Risks

**Pour cost will move.** Once real prices land, a period containing shipments
will not match what the same period reported last week. That is the point of
the feature, but it will look like a regression to anyone who does not know it
shipped, and it should be said out loud in the release note.

**The AI will get numbers wrong.** The 10% flag, the reconciliation line and
zod validation on post are three independent guards, and none of them is
optional. A mis-parsed unit cost that passes all three still only affects one
item's cost price, which is recoverable by editing the item.

**`usage_logs` is older than this repo's migrations.** Its true definition
lives in a database nobody here can read from source. Every statement touching
it must be defensive.

---

## Sequencing

1. Migration — `inventory_shipments`, the two `usage_logs` columns, RLS.
2. `lib/inventory/shipments.ts` + tests. Pure, no DB, TDD.
3. `lib/ai-parsers/parse-shipment-with-ai.ts`.
4. Server actions, with the scope audit passing.
5. The books one-liner plus charge allocation — smallest change, largest blast
   radius, so it goes in only once the data it reads can exist.
6. UI: route, list, dialog.
7. Inventory dashboard panel.

Steps 1-2 are independently useful and carry no risk to existing pay runs or
P&L output; step 5 is the one to review hardest.
