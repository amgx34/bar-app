# Three changes: drink recipes, fees & losses, and protecting corrected hours

**Status:** Change 3 BUILT (2026-08-20). Change 2 losses and Change 1 still to do;
transaction fees resolved as out of scope.
**Date:** 2026-08-20

Ordered by risk, not by the order they were asked for. Change 3 is a live
data-loss bug and should go first.

---

## Change 3 (do first) — 2Touch overwrites corrected hours

### This is broken right now, not merely untested

`app/api/2touch/ingest/route.ts` writes shifts with a blind upsert:

```ts
.from('employee_shifts')
.upsert([...shifts.values()], { onConflict: 'organization_id,employee_id,shift_date' })
```

There is no manual-protection check. Compare the Z-report path in the same file,
which deliberately guards a person's cash count:

```ts
cash_tips:        manual ?? money(r.cash_tips ?? 0),
cash_tips_source: manual === undefined ? 'pos' : 'manual',
```

The agent re-sends a rolling window (`Sync.LookbackDays`, default 2; Scotty's
local config uses 14) every 5 minutes. So a correction made in Payroll → Adjust
hours survives **until the next sync**, then silently reverts. The adjustment
row in `payroll_adjustments` remains, so the log claims a change that the pay run
no longer reflects — worse than losing it outright, because it looks recorded.

**This also undermines the backfill script** validated on 2026-08-19. Any date it
writes that falls inside the lookback window gets reverted by the agent within
minutes. Right now the script only "sticks" for dates older than the window.

### The fix — mirror the cash-tips pattern

```sql
ALTER TABLE employee_shifts
  ADD COLUMN hours_source TEXT NOT NULL DEFAULT 'pos'
    CHECK (hours_source IN ('pos', 'manual'));
```

- `adjustShiftHours()` and `removeFromShift()` set `hours_source = 'manual'`.
- The backfill script sets it too.
- Ingest reads existing `(employee_id, shift_date)` rows marked `manual` for the
  incoming window and **excludes them from the upsert**, exactly as
  `manualCashTips` does today.

### Why a column rather than inferring from `payroll_adjustments`

An adjustment log entry means "somebody changed this once", not "this row is
authoritative now". Inferring would also make the ingest's hot path depend on a
join against a table that grows forever. One boolean-ish column on the row being
written is cheaper and states the intent directly.

### Releasing the lock

A manual row stays frozen forever, which is wrong when the POS is later fixed and
re-synced deliberately. Add a "revert to POS figures" action on the adjust dialog
that sets `hours_source` back to `'pos'` and records the reversion as its own
adjustment row.

### Testing

- Unit: ingest filter honours `manual` — the case that has never had a test.
- In-app: correct hours, force a sync, confirm the figure holds.
- Extend `backfill-employee-hours-smoketest.sql` with a 9th assertion covering
  `hours_source = 'manual'` on the rows it writes.

---

## Change 2 — Transaction fees and losses

### Losses: the table exists, nothing fills it

`losses_reports` (voids/comps/spills/discounts) already exists and Books already
reads it in `app/(app)/app/books/actions.ts`. But the agent exposes only three
feeds — `ZReportKey`, `EwReportKey`, `ItemAuditKey` (`Setup/FeedSpecs.cs`) — and
none of them is losses. The table is empty for Scotty's, and every "Losses" figure
on Books is therefore £0 by construction.

The 8/18 Z carries: Voids 12.91, Comps 0.00, Spills 0.00, Discounts 5.75,
Emp Discounts 26.00, Total 44.66.

Note `losses_reports` has no **emp_discounts** column — the Z separates it from
ordinary discounts, and folding the two together loses the distinction between "a
promotion" and "staff drinking on the house", which are different problems.

**Work:**
1. `ALTER TABLE losses_reports ADD COLUMN emp_discounts_amount DECIMAL(10,2) DEFAULT 0;`
2. New `LossesKey` feed in `FeedSpecs.cs` + a `TwoTouchProfile.Losses` query. The
   source tables need identifying on a real 2Touch box — this is the one piece of
   this plan that cannot be written from the repo alone.
3. Ingest handler → `losses_reports`, upsert on `(organization_id, report_date)`.
4. Books already consumes it; surface `emp_discounts_amount` in the breakdown.

### Transaction fees: DECIDED — not brought in

The Z shows `Transaction Fee 150.94` on 8/18, about 8.9% of card sales. Resolved
on 2026-08-20: it is **surcharged to the customer and remitted to the
processor**, so it is a pass-through in exactly the way sales tax is. It never
becomes the bar's revenue and never becomes its cost, so bringing it into the
P&L would inflate both sides by the same figure and change nothing except the
apparent size of the business.

`total_sales` — the Z SUBTOTAL — remains the correct reporting basis. No column,
no feed change.

**One caveat, for the record.** If what the processor charges ever diverges from
what is surcharged to customers, that difference IS real P&L. It cannot be seen
in the Z report; it is an invoice reconciliation, and it would belong as an
operating expense rather than a field on `z_report_days`.

---

## Change 1 — Recipes for shots and drinks

### Most of this already exists

Before building anything: `pos_bundles` + `pos_bundle_components` **is** a recipe
system, and it already does what was asked.

- `pos_bundle_components.unit` is `'each' | 'oz'` (migration `20260819000000`).
- `componentUnits()` in `lib/pos/pour.ts` converts an oz component through the
  item's `bottle_size_ml` into stock units.
- `lib/pos/bundles.ts` applies it during depletion, so **the right ingredients
  already come off in the right amounts**.
- `saveBundle()` and `bundles-panel.tsx` are a working editor in Settings.
- `deal-performance.ts` already computes `costPerUnit` from component costs.

A "Vodka Soda" POS item can today be given a recipe of 1.5 oz well vodka and it
will deplete 0.059 of a bottle per sale and cost correctly.

**Multiple liquors per drink already work.** `components` is an array of up to 50
(`bundle-actions.ts`), the uniqueness key is `(bundle_id, inventory_item_id,
unit)` so one recipe holds many items, and the panel has an add-component
control. A Lemon Drop is expressible today as:

| component | qty | unit |
|---|---|---|
| Triple Sec | 1.0 | oz |
| Lemon Vodka | 1.5 | oz |

Both bottles deplete by their own fraction on each sale, and the cost is the sum.
No schema or code change is needed for this.

**Mixers are deliberately out of scope.** Dilution and free-pour soda cannot be
measured reliably from a POS feed, and a guessed figure would put wrong numbers
into COGS with an authority they have not earned. Depletion only touches
components that are listed, so simply omitting mixers is already the correct
behaviour rather than a gap — the recipe covers the liquor, which is where the
cost and the shrinkage actually are. The editor should say so explicitly, so an
operator does not think they have configured it wrong.

So this change is **surfacing and completing**, not building.

### What Scotty's data actually shows (2026-08-20)

The plan above described this as surfacing work. Checking the live data says
otherwise: for this bar, **no liquor is being tracked at all.**

Every `inventory_items` row was auto-created by the ingest from a POS menu name,
and every one has `bottle_size_ml = NULL, pour_size_oz = NULL`. Consequences on
2026-08-19 alone:

| POS item | qty | what actually happens |
|---|---|---|
| Well Vodka | 140 | tries to remove **140 bottles** (no pour configured) |
| Lemon Drop | 32 | removes 32 units of a phantom item *called* "Lemon Drop" |
| 4 For 10$ Lemon Drop | 11 | = 44 shots; one recipe exists, pointing at the phantom |
| Trashcan, Big Sips, Jack And Coke, Amaretto Sour, Long Island, Mimosa, … | — | all phantom stock items |

So the cocktails are inventory rows rather than recipes, and the real bottles
have no pour size. Exactly **one** `pos_bundles` row exists for this bar.

This reorders the work. Change 1 is not a nice-to-have on top of a working
system — it is what makes inventory function for this bar at all, and the bulk
of it is **configuration, not code**:

1. Give the real bottles a `bottle_size_ml` and `pour_size_oz`.
2. Convert the cocktails from phantom inventory items into recipes over those
   bottles, and add the drink names to `pos_excluded_items` so the ingest stops
   re-creating them.
3. Deactivate the phantom rows left behind.

Which makes the **gap report the first thing to build**, not the third: it turns
the above into a ranked work list the operator can actually execute, and it is
read-only.

### Doubles vs singles

Checked on 2026-08-20. No `Double …` items exist in the menu, and the per-unit
price is stable (Well Vodka averaged $4.92 on 8/18 and $4.70 on 8/19), which is
consistent with a double being rung as **qty 2 of the single** rather than as an
upcharge on one line.

If so, doubles need no special handling: `qty_sold` 2 x pour size removes two
pours, correctly, as soon as the bottle is configured. Worth confirming by
ringing one double and checking it lands as `qty 2`.

The one shape that would be invisible is a double held as a **modifier outside
`tblSalesHist`** — the ItemAudit feed joins `tblItem` on `d.fkItemID` from the
sale-lines table, so a modifier stored elsewhere never reaches Rail at all. No
modifier-shaped rows appear in the data, so this looks unlikely here, but it is
the thing to check first if pour counts ever come in low.

### What is actually missing

1. **It is called "Deals & bundles".** Nothing signals that this is where you
   define what a cocktail is made of. Reframe as **Recipes**, with deals as one
   kind of recipe.
2. **Cost per drink is not visible where it matters.** `costPerUnit` exists but
   only inside the Analytics → Deals panel. It should appear on the recipe editor
   as a live figure — the same "what this works out to" treatment the item form
   got on 2026-08-19 — and ideally on the drink itself.
3. **No gap report.** There is no way to see which POS drinks have no recipe and
   are therefore depleting nothing (or depleting a whole bottle). This is the
   highest-value part: `pos_item_sales` knows every drink that sold, and
   `pos_bundles` knows which have recipes — the difference is the work list.
4. **No margin per drink.** With the recipe cost and `pos_item_sales.net_sales`,
   per-drink margin is derivable and is the number a bar actually prices on.

### Sequencing within this change

1. Gap report first — it is read-only, needs no schema, and tells the operator
   how much work the rest is worth.
2. Live cost/margin in the recipe editor.
3. Rename and reposition the UI.

Deliberately no schema change here. Adding a parallel "recipes" table beside
`pos_bundles` would create two systems that both deplete stock, and they would
disagree.

---

## Order and dependencies

| # | Change | Blocking? | Needs a decision from the operator |
|---|---|---|---|
| 3 | Protect corrected hours | ~~live data loss~~ — **done** | no |
| 1 | Recipes: pour sizes + cocktail recipes | **effectively yes** — no liquor is tracked today | no |
| 2a | Losses feed | no | source tables need a real 2Touch box |
| ~~2b~~ | ~~Transaction fee~~ | — | resolved: pass-through, out of scope |

Change 3 first. It is the only one where the current behaviour is actively
destroying operator input, and it is a precondition for the backfill script being
trustworthy.

## Open questions

1. ~~Transaction fee: kept or passed through?~~ Resolved 2026-08-20: passed to
   the processor, so out of scope.
2. **Does the 2Touch schema expose losses per business date?** The Z prints them
   per report; the feed needs a per-ticket or per-day source with a timestamp the
   business-date cutoff can be applied to.
3. **Should `hours_source = 'manual'` expire?** A correction from six months ago
   probably should not block a deliberate re-sync forever.
