# Inventory: unit consistency, and the visual overhaul

**Status:** the unit bugs described in Part 1 are FIXED (2026-08-19). Part 3 is design only.
**Date:** 2026-08-19

---

## Correction to earlier drafts of this document

The first two drafts claimed that "there is no pour-to-bottle conversion anywhere
in the pipeline" and proposed a `sell_mode` column plus a rewrite of
`pos_apply_item_sales()` to add one.

**That was wrong.** The conversion already exists and is already wired in:

- `lib/pos/pour.ts` — `unitsPerSale()`, `componentUnits()`, `describePour()`,
  with an item → category → organisation pour chain.
- `lib/pos/bundles.ts:181` — `qty * unitsPerSale(item, { categoryPourOz, orgPourOz })`,
  commented *"The conversion that stops 185 shots removing 185 bottles."*
- `app/api/2touch/ingest/route.ts` — fetches `bottle_size_ml`, `pour_size_oz`,
  `inventory_categories(default_pour_oz)` and the org default, and passes them in.
- `pos_bundle_components.unit` (`'each' | 'oz'`), added by
  `20260819000000_add_pour_tracking.sql`.

So `pos_apply_item_sales()` receives quantities **already in stock units**, and
its 1:1 subtraction is correct. `usage_logs.quantity` is likewise already in
stock units, so Books COGS was never at risk.

The error came from reading the SQL migration and reasoning about the pipeline
from it alone, without tracing the TypeScript that builds `p_components`. A
migration written on that premise would have applied the conversion a second
time. It was deleted unapplied.

**A `sell_mode` column is not needed.** An item is sold by the pour when it has
both a container size and a pour size; that is already the rule, and it is
enforced in one place.

---

## Part 1 — What was genuinely broken (now fixed)

Two consumers read `pos_item_sales.qty_sold`, which is the **raw POS drink
count**, and combined it with figures in **stock units**. Both were live bugs,
unrelated to any redesign.

### 1.1 Velocity mixed drinks with stock — FIXED

`lib/pos/velocity.ts` added `pos_item_sales.qty_sold` (drinks) to
`usage_logs.quantity` (stock). For a spirit poured at 1.5oz from a 750ml bottle
the sales side was ~17× too large.

That number then fed `daysRemaining = currentStock / dailyUsage` in both
`app/(app)/app/inventory/analytics/actions.ts` and the dashboard — so days of
cover read roughly seventeen times too short, and reorder alerts fired for items
with plenty on the shelf.

**Fix:** `ItemRef` now carries `unitsPerSale`, supplied by callers from
`lib/pos/pour.ts`. The sales side is converted before the two sources are added.
Everything the module reports downstream — `unitsMoved`, `dailyUsage` — is in
stock units. A new `salesCount` keeps the raw drink count for questions that are
genuinely about the POS, and `topSellers()` now ranks on it (ranking best
sellers on stock consumed would put a keg above a spirit that outsold it many
times over).

### 1.2 Deal margins ignored the recipe's unit — FIXED

`pos_bundle_components.unit` has existed since `20260819000000`, but
`deals-actions.ts` selected only `quantity` and passed it through raw. An `'oz'`
component was therefore costed as though ounces were stock units:

> 1.5 oz of a $20 bottle priced at **$30.00** instead of **$1.18**

Every cocktail deal looked like it was selling far below cost, which is exactly
the judgement the deals panel exists to make.

**Fix:** `deals-actions.ts` now selects `unit`, `bottle_size_ml` and
`pour_size_oz`, and converts through `componentUnits()` — the same function
depletion uses. `DealComponent.quantity` is documented as stock units.

A second, subtler mismatch in the same file: `alaCarteValue` multiplied a
stock-unit quantity by `salePrice`, which is per **drink**. A 0.06-bottle pour
was priced as six hundredths of a drink. `DealComponent` gained an optional
`servings`, and the à-la-carte sum uses it, falling back to `quantity` for
whole-unit components where the two coincide.

Note that `costPerUnit` and `margin` were **already correct** in
`deal-performance.ts` — they multiply component quantity by per-stock-unit cost
and compare against the bundle's own POS revenue. An earlier draft of this
document said otherwise; it was wrong about that too.

### 1.3 Explanatory text that misdescribed the model — FIXED

The "How does stock tracking actually work?" panel added to the item form
earlier the same day stated that every POS sale removes one whole unit and that
"bottle size and pour size are for costing only". Both sentences were false.

It now derives its wording from `describePour()` — the same helper the ingest
route depletes with, which is precisely what that function's doc comment says it
exists for. It also surfaces `describePour`'s existing warning for the real
misconfiguration in this area: **a pour size set with no container size**, which
silently falls back to deducting a whole unit per sale.

---

## Part 2 — Checked and closed out

**Items with a container size but no pour size — checked, nothing to do.**
An earlier version of this document flagged ~100 of these as needing attention.
That was the wrong test, twice over:

- A null `pour_size_oz` on an item is normal. The pour resolves
  item → category → organisation, so an item with none of its own is served by
  the category default.
- All ~100 turned out to belong to the demo bar, not a real one, and they are
  wine — which `20260819000000_add_pour_tracking.sql` gives a 5oz category
  default. They were correctly configured the whole time.

Query 6 in `supabase/diagnostics/inventory-column-types.sql` has been rewritten
to resolve the whole chain and flag only the case that is genuinely wrong: a
container size with **every** level of the pour chain empty, which makes
`unitsPerSale()` return 1 and quietly deduct a whole bottle per sale. It also
reports `pour_source`, so a surprising deduction can be traced to the level it
came from rather than guessed at.

**`current_stock` is fractional.** Confirmed indirectly: one row of 1040 holds a
fractional value, which an `integer` or `numeric(_,0)` column could not. Run
query 1 of the same file for the exact type if precision ever matters.

**Weigh sessions never write `current_stock`.** There is no reference to that
column anywhere under `app/(app)/app/inventory/weigh/`. Weigh is a pure
ounce-based variance report; only *Adjust stock → Physical count* resets a
level. Not a bug, but it surprises people, and the item form now says so.

---

## Part 3 — Visual overhaul (design only)

The item list is a dense eight-column table: the right shape for auditing, the
wrong shape for the two things people actually do — spotting what needs
ordering, and understanding one item.

- **Shelf view** as default — items as cards grouped by category, each with a
  stock-against-par bar rather than two numbers to compare mentally. Below par
  is a filled amber band, not an icon.
- **Table view** behind a toggle, unchanged, for reconciliation.
- **Item detail** as a page rather than a dialog: stock curve from `usage_logs`,
  cost and margin per serving, deliveries, weigh variance, and which POS items
  map to it.
- **Cost/margin strip** on every card: `$0.96 → $9.00 · 89%`.
- **Pour provenance** on the item row, from `describePour().source` — whether a
  pour came from the item, its category, or the bar default is invisible today
  and is the first thing to check when depletion looks wrong.

The phone card layout added on 2026-08-19 in
[`inventory-table.tsx`](../../../app/(app)/app/inventory/_components/inventory-table.tsx)
is the seed of the shelf view — it already renders items as cards from the same
data.

### Per-item setup queue

Still worth building, but its purpose has changed. It is no longer about
assigning a sell mode; it is about finding items whose **resolved** pour is
missing (query 6), plus any whose 30-day POS sales imply an implausible number
of whole units for their category. Today that set is empty on the real bar, so
this is a guard against future drift rather than a backlog to work through.

## Sequencing

1. ~~Unit consistency in velocity and deals~~ — done.
2. ~~Audit the container-size-without-pour items~~ — checked, nothing to fix.
3. Setup queue, scoped to pour configuration.
4. Shelf view and item detail.

## What this design does not do

- Does not add `sell_mode`. The container-size + pour-size pair already
  expresses it, and a second switch would be a second source of truth.
- Does not add a per-serving cost field. Cost stays per stock unit; cost per
  pour stays derived.
- Does not change `sale_price`. It is per drink, which is correct — it was only
  ever mislabelled in the UI, and that is fixed.
