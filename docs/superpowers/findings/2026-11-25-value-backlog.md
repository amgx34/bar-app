# Value backlog: what else would raise Rail's value to a bar (2026-11-25)

Branch `rebuild/foundation`. Read-only investigation of the code; nothing was run against a live bar. Scope facts from the owner: no direct deposit work (keep the free bank-file export), Stripe billing exists but is not live, first customers are single-location bars on 2Touch around Cincinnati and Northern Kentucky, Clover and Toast are being added by another workflow, one founder, no legal entity.

**Method and limits.** I read the code paths named below and the docs listed in the brief. Every dollar and hour figure is **an estimate from my own assumptions, not a measurement**; the assumptions are in the next section so the owner can change them. Competitor facts come from `competitors/matrix.md`, which rests on public pages and says `?` means unverified. Build days are for one developer who knows this codebase, including tests and the AGENTS.md rules (org scoping, stock units, unit_cost fallback), excluding owner-only steps and counsel review.

## Assumptions behind every estimate (change these, the numbers move)

- A manager's time is worth $25 an hour. (Assumption.)
- A typical bar spends $8k to $15k a month on liquor, beer and wine, and takes $40k to $80k in sales. (Assumption; nothing in the repo records real bar figures. The founder's own bar numbers are a `TODO(owner)` in `positioning-and-icp.md`.)
- Rail's planned price is $99 to $199 a bar a month (`pricing-and-packaging.md`, hypothesis, no willingness-to-pay data yet). So a feature is worth building if it plausibly gives back a good fraction of that every month, or protects the subscription.
- Value per month is **bar-equivalent dollars** (hours at $25 plus money kept). Score = value divided by build days.

## The ranking

| Rank | Idea | Build days | Est. value per bar per month | Score | Data trustworthy today? | First piece? |
|---|---|---|---|---|---|---|
| 1 | **A. "Your POS feed went quiet" alert** (new, not in your list) | 1.5 | $100 (protects the whole subscription) | 67 | Yes | **Yes** |
| 2 | **2. Did the night tie out** | 4 | $200 | 50 | Partly (cash split only on newer agents) | **Yes** |
| 3 | **6. Weekly owner summary** | 3 | $80 (retention more than dollars) | 27 | Yes for sales, hours; not for COGS | **Yes** |
| 4 | **B. Fast count session** (new) | 5 | $120 (and it unlocks 1 and 4) | 24 | n/a, it creates the data | **Yes** |
| 5 | **3. Prior-period comparison** | 2.5 | $50 | 20 | Sales yes; Books partly | **Yes** |
| 6 | 4. Suggested orders | 6 | $100 once stock is trusted | 17 | Weak until B ships | |
| 7 | 1. Variance alerts | 10 | $100 to $360, low confidence | 10 to 36 | Weak | |
| 8 | 5. Invoice photo to shipment | 6 | $60 | 10 | Parser is text only | |
| 9 | 7. QuickBooks/Xero friendly export | 3.5 | $40 for bars with a bookkeeper | 11 | Not until Books is checked | |
| 10 | 10a. Working data export and account deletion | 5 | not a feature, a promise the site already makes | n/a | n/a | Do before first paid bar |
| 11 | 8. Payroll export for Gusto, Square, QuickBooks | 3 to 6 | $30 | 5 to 10 | Formats unverified | |
| 12 | 10b. Self-serve trial | 8+ | growth, not value to an existing bar | n/a | Blocked | |
| 13 | 9. Native app pieces | 30+ | $50 | 2 | n/a | |
| | 10c. Status page | 0.5 | trust only | n/a | n/a | any time |

Scores for 1 show a range because the savings depend on facts nobody has measured. Ranks 6 to 8 are close and could swap once real bar data exists.

**Why the top five are those five.** They are cheap, they run on data that already exists and is the most trusted in the product (Z reports, cash split, hours), and none depends on Clover or Toast being finished. B is in because three of the bigger ideas (1, 4 and honest stock) fail without a count the bar actually keeps up.

---

## A. "Your POS feed went quiet" alert (new)

**Why it is on the list.** `AGENTS.md` records a bar that ran a month with a green strip, a current agent version and no sales since August. `lib/pos/sync-health.ts` (`assessSyncHealth`, with a `no-data` status) already decides this, but it only paints a strip on screen. `lib/notifications/types.ts` has nine event types and none is about the feed, so nobody is told.

- **Exists:** `lib/pos/sync-health.ts` and its test, `last_sync_at`, `last_sync_errors`, `last_sync_summary` in `pos_config`, `lib/pos/pos-config.ts`; the notification pipeline (`lib/notifications/detect.ts` pure, `deliver.ts`, `run-daily.ts`, `dedupe_key` unique index, preferences with role defaults).
- **Missing:** a `pos.feed_stale` event type, a pure detector over `assessSyncHealth`, a dedupe key per stale episode (so it fires once, not daily), a row in the Settings notifications tab. Cron is once a day on the Hobby plan, so detection lags up to 24 hours. That is fine for "no sales since Tuesday", not fine for "down right now".
- **Data trust:** high. It reads the sync outcome the ingest already writes.
- **Value reasoning (estimate):** the failure it covers has already happened once to a real bar. Losing a month of sales history is not recoverable without a backfill (`--backfill` exists but needs someone at the box). Catching it on day 1 instead of day 30 protects the subscription itself. I put $100 a month as a stand-in for "avoids a churn event"; this is the least measurable number in the document.
- **Risks:** money none. Tenancy: the cron routes across orgs, so each query needs an `admin-scope-ok` justification or an org filter (`npm run audit:scope`). Privacy: none beyond the org's own alert. Amber, not alarming, for `no-data`, per AGENTS.md (a closed bar is indistinguishable from a dead feed).
- **Clover/Toast dependency:** real but small. A Clover or Toast bar has no agent, so "quiet" means a failed OAuth refresh or an empty poll. The detector should take a provider-neutral health object. If the other workflow writes `last_sync_*` the same way, no extra work; if not, add a day. **Unverified** until their code lands.
- **Honest note:** the strongest case is for 2Touch bars, which is the first customer type.

## 2. "Did the night tie out" close screen

- **Exists:** the pieces are already on the screen in the wrong place. `app/(app)/app/payroll/_components/cash-tips-card.tsx` computes "Expected in drawer = cash sales less cash tips" from `z_report_days.cash_sales`, `card_sales`, `cash_tips`, and shows it only when `cash_sales` is non-null. Sales night view: `app/(app)/app/sales/_components/night-view.tsx`. Migration `supabase/migrations/20260819000001_add_cash_card_sales.sql`. Cash-tip freezing: `cash_tips_source = 'manual'`.
- **Missing:** a field for the cash the manager actually counted in the drawer (new nullable column on `z_report_days`, writer in `payroll/cash-actions.ts` style, `canEdit` gate), the gap named in dollars, and a place in the Sales night view or a Today card rather than hidden in the payroll tips card. Tips owed (card tips plus cash tips) against what was paid out is the second line. Also: a pure function in `lib/` with tests, since this is money.
- **Data trust:** medium. `cash_sales` and `card_sales` are NULL for older agents, emailed Z reports and pre-1.1.0 configs, and NULL means "not reported", never zero. The screen must say "cannot tie out, your POS did not send the cash split" rather than show a false match. For POS tips, AGENTS.md says 2Touch reports 0 cash tips for nearly every bar, so cash tips come from the jar count entered by a person.
- **Value reasoning (estimate):** closing out cash and finding a $20 gap by hand is plausibly 20 to 30 minutes a night at a bar that does it; times 30 nights times $25 is about $250 to $375. I discount to $200 because many bars do not count to the dollar every night. A named gap also catches short drawers sooner, which I cannot price.
- **Risks:** money: the screen must not call a night "balanced" from incomplete data. A cash overage hidden by a rounding rule is worse than no screen. Privacy: a per-night gap is implicitly about whoever ran the drawer; keep it at the night level, not per person, and owner/manager only (`lib/permissions.tsx`). Tenancy: standard org filter on the new column.
- **Clover/Toast dependency:** **material.** Whether Clover and Toast adapters fill `cash_sales` and `card_sales` through `applyNormalized` decides whether this works for their bars at all. Toast and Clover both separate tender types in their APIs in general, but I have not read their payloads here, **unverified**. Design the screen to degrade to "not reported".
- **Honest note:** this is the idea most likely to make an owner say "this is why I pay for it" in a demo, because it speaks about the actual close. It is also the one most likely to embarrass Rail if the POS cash figure is wrong, so test against a real Z report first.

## 6. Weekly owner summary

- **Exists:** `lib/notifications/run-daily.ts`, `detect.ts`, `deliver.ts` (in-app, push, email path through `lib/email`), `notifications.dedupe_key`, per-user preferences with `ROLE_DEFAULTS` in `types.ts`, existing alerts for nightly sales, tips per hour and anomalies. Sales and hours come from `lib/pos/sales-analytics.ts` and payroll code.
- **Missing:** a `weekly.summary` event type, a pure builder for the week (sales, versus the prior week, tips per hour, labor hours, low stock count, anything awaiting approval), a weekday gate inside the daily cron (the Hobby plan allows exactly one cron a day, so run the weekly pass on one weekday inside the same job), an email template.
- **Data trust:** sales, hours and tips are the most trusted figures. Cost of goods is not (see 3 and 7), so **leave COGS and profit out of the first version**.
- **Value reasoning (estimate):** this saves little time; its value is that an owner who does not open the app still sees it working, which is retention. I set $80 as a stand-in. The risk of overselling: it only helps if the numbers are right the first time an owner reads them.
- **Risks:** money: a wrong figure in an email cannot be recalled. Privacy: the email leaves the app, so do not include employee pay or names, only bar totals; gate on owner role. Email sending depends on the shared Gmail app password (`GMAIL_USER`, `GMAIL_APP_PASSWORD`), which has a daily send ceiling and one point of failure. **Unverified limit**, check before sending to more than a few dozen owners. Dedupe key on the week start date so a cron re-run is a no-op.
- **Clover/Toast dependency:** low. It reads normalized sales, not provider data. A bar whose sync is stale should say so in the email (ties to A).

## B. Fast count session (new)

- **Why:** `2026-11-25-inventory-audit.md` ranks "counting takes about six taps per item, no tap-to-count or +/- control, no count session with items left" as the biggest open competitor gap (item 8). Ideas 1 and 4 both assume `current_stock` is right, and `positioning-and-icp.md` says Rail will not promise accurate stock in week one. A count a manager will really do is the thing that makes stock believable.
- **Exists:** `inventory/_components/stock-adjust-dialog.tsx`, `inventory/weigh/` (bottle level measurements), `lib/inventory/packs.ts` and `pack-line.ts` (a pack calculator), the native spec's offline count queue plan.
- **Missing:** a one-screen list with a stepper per item, "items left", a single batch write of count adjustments with reason `recount` (the inventory audit notes the dialog defaults to Add/Delivery, so a count saved with defaults is logged as a delivery, a real bug to avoid), and a variance line per item against the expected stock.
- **Data trust:** it produces the data. The expected-versus-counted difference it records is the raw material for idea 1.
- **Value reasoning (estimate):** a monthly count of 200 items at 6 taps each versus about 2 taps each is a few hours a month saved ($75 to $100), and the larger benefit is trust in stock. $120 total.
- **Risks:** money: counts move `current_stock` and therefore the books; a batch write must be one transaction and use stock units (AGENTS.md), and must not feed `usage_logs` as `delivery`. Tenancy: batch update must filter `organization_id` per row.
- **Clover/Toast dependency:** none for the screen. POS depletion for those providers (via the shared applier) decides how fast stock drifts between counts.

## 3. Prior-period comparison on Books and Sales

- **Exists:** Sales has previous/next period navigation (`app/(app)/app/sales/page.tsx`, "Previous period" control) and a weekday baseline for anomalies (`lib/pos/baselines.ts`). Books has `getBooksData` (`books/actions.ts`) and charts, with no comparison.
- **Missing:** delta chips ("up 8 percent on last week") next to the headline figures on Sales; on Books, run `getBooksData` twice and show the change per line. A pure `deltas()` function with tests.
- **Data trust:** Sales yes. Books partly: AGENTS.md notes COGS depends on `unit_cost ?? cost_price`, deliveries before shipments existed fall back to current cost, and the `critique/summary.md` money-integrity list is still open. Comparing two untrusted months can show a swing that is purely a costing artifact. **Ship Sales comparison first; gate Books comparison behind the same check as idea 7.**
- **Value reasoning (estimate):** small. Owners can already flip periods. It saves a mental subtraction. $50.
- **Risks:** money: comparison of a period with a missing Z report must say "incomplete", not show a drop. Percent of a tiny base is noise; suppress below a floor.
- **Clover/Toast dependency:** none.
- **Honest note:** the weakest of the top five. It is in because it is cheap and it makes idea 6 richer.

## 4. Suggested orders

- **Exists:** par and below-par logic (`lib/inventory/par.ts`), velocity in stock units (`lib/pos/velocity.ts`, tested), rep messaging with email and text (`lib/reps/email.ts`, `sms.ts`, `app/(app)/app/reps/`), a low-stock digest. The inventory audit lists this as open item 9 and says competitors (BevSpot, Bar Cop, MarketMan, WISK) treat par as an order list.
- **Missing:** an order draft: for each below-par item, quantity to reach par plus lead-time cover from velocity, rounded to case size (`units_per_pack`), grouped by the item's rep, handed to the existing reps order form. Needs a rep-per-item link if one does not exist (**unverified**; I did not find it in `inventory_items`).
- **Data trust:** weak until stock is believed. Par is a hand-typed number per item; velocity only works for items with a container size and a pour size or recipe (`lib/pos/pour.ts`). An item without them deducts a whole unit per sale, which makes the suggestion wildly high.
- **Value reasoning (estimate):** one hour a week ordering, partly saved, plus fewer run-outs: $100 a month once stock is trusted, near zero before.
- **Risks:** money: a suggested quantity that is 10x wrong gets sent to a rep and becomes a real purchase. It must always be a draft the manager edits, never auto-sent. Privacy: none. Tenancy: standard.
- **Clover/Toast dependency:** velocity depends on item sales from those providers being converted through the same pour logic.
- **Honest note:** sounds like a headline feature, but is only as good as the stock number under it. Build B first.

## 1. Variance alerts (pour or usage exceeding sales)

- **Exists:** weigh reports (`weigh_reports`, `weigh_report_items` with `opening_level`, `closing_level`, `full_bottles_opened`); `getPourAnalysis` and `expected_pours` in `inventory/weigh/actions.ts` (expected pours from measured oz); POS sales in `pos_item_sales`; depletion via `pos_apply_item_sales`; `lib/pos/pour.ts`.
- **Missing, and this is the key point:** nothing compares the two. `getPourAnalysis` turns bottle weights into pours but never sets that against what the POS says was sold. And **depletion alone cannot reveal theft**: `current_stock` is reduced by what the POS reports, so it assumes every sale was rung. Over-pouring and unrung drinks only show up when a physical measure (a weigh session or a count) disagrees with the POS-implied use. So this idea requires bars to keep doing weigh sessions or counts, which is the hard part, not the arithmetic.
- **Data trust:** weak. Needs per-item container size and pour size, bundle resolution for deals and exclusions (a "Bucket of 5" must expand), stable item identity between POS and inventory, and a recent opening and closing measure. Any gap produces false accusations.
- **Value reasoning (estimate):** if a bar spends $10k a month on beverage cost and finds 2 to 3 percent loss, that is $200 to $300 a month, up to $360 at 3.6 percent on $10k. The range is a guess; I did not find a source in the repo, and published industry shrink figures are claims I did not verify. I score it as a range and treat it as low confidence.
- **Risks:** this is the riskiest idea of the ten. A flagged variance reads as "an employee is stealing". Money and people: false positives can lead to firing someone; the screen must say "stock moved more than sales explain" and never name a person. Privacy and employment law: do not attribute to a shift or server without counsel. Per `claims-register.md` the site already refuses "accurate stock" promises, so the feature must not be marketed as theft detection.
- **Clover/Toast dependency:** the same item and pour mapping, so it only works for bars where those are set.
- **Recommendation:** build B first, then ship a single plain report ("counted versus expected, by item, last 30 days") and not push alerts. Alerts come only after a few bars have two clean weeks.

## 5. Invoice photo to shipment

- **Exists:** `lib/ai-parsers/parse-shipment-with-ai.ts` (Groq, text in), `parseShipmentText` in `inventory/shipment-actions.ts` which returns a reviewable `ShipmentReview` matched by lowercase name then SKU, `lib/inventory/shipments.ts` (freight and tax allocation by share of value), `shipments/_components/log-shipment-dialog.tsx`.
- **Missing:** the whole image path. The parser takes text; I found no vision call or image upload in `lib/ai-parsers/`. Needs a vision-capable model (the model in `lib/ai-parsers/model.ts` is a Groq text model; whether Groq offers a suitable vision model is **unverified**), a phone camera upload, file size limits, and mobile-friendly review (the audit says the line review table is not phone-usable).
- **Data trust:** the existing flow is already review-then-post, which is the right guard. OCR on a crumpled distributor invoice will misread quantities and case sizes.
- **Value reasoning (estimate):** a bar logs perhaps 8 to 16 deliveries a month at about 10 minutes each: 1.5 to 3 hours, about $40 to $75. It also keeps costs current, which helps Books, but only if bars log deliveries at all today.
- **Risks:** money: a misread cost flows into COGS through `unit_cost`; keep the manual review step mandatory and never auto-post. **Privacy:** invoice photos go to a third-party AI vendor and may show account numbers; this must be in the privacy policy, which has no legal entity behind it yet (a counsel item). Tenancy: store images under an org-scoped path if kept; better to not keep them.
- **Clover/Toast dependency:** none.
- **Honest note:** looks impressive in a demo, but saves less than its build size suggests and carries the only third-party image privacy issue in the list.

## 7. QuickBooks/Xero friendly export

- **Exists:** `app/(app)/app/books/` computes revenue, COGS, supplies, expenses, payroll cost; per-feature CSVs exist (payroll review client CSV, NACHA route at `app/api/payroll/nacha/route.ts`).
- **Missing:** a server route that returns a dated CSV in a generic journal or bank-style layout (date, account, debit, credit, memo) for daily sales by tender, sales tax collected, cost of sales and payroll. QuickBooks Online and Xero each have their own import templates; I did not read them, so the exact column names are **unverified**.
- **Data trust:** sales and tax figures fine. COGS and Books are not yet verified against real data (the critique's money-integrity list is open), and exporting a wrong number into a bookkeeper's ledger is worse than showing it on a screen.
- **Value reasoning (estimate):** a bookkeeper or the owner re-keys sales and payroll once a month, 1 to 2 hours, $25 to $50. Only bars with a bookkeeper benefit. `pricing-and-packaging.md` currently lists QuickBooks or Xero sync as a refused claim, so it would also change what can be said.
- **Risks:** money: the account mapping is the bar's, not Rail's, so export raw categories and let their bookkeeper map. Tenancy: the route must use the org from `getCurrentOrg()` and filter every query.
- **Clover/Toast dependency:** none beyond sales data being present.

## 8. Payroll export for Gusto, Square Payroll and QuickBooks

- **Exists:** the payroll review CSV (built in the browser in `payroll/review/_components/payroll-review-client.tsx`), the NACHA bank file (free, kept), tip pool and cash tip logic, payroll tax code under `lib/payroll/tax`.
- **Missing:** layouts matching each product's import. Gusto, Square Payroll and QuickBooks each accept hours and tips in their own shape, **which I did not verify**. `2026-11-25-direct-deposit-replacement.md` shows Square Payroll imports direct tips only from Square POS and that Gusto tip handling "needs a check with Gusto", so a tip import into those products may not work from a CSV at all.
- **Value reasoning (estimate):** useful only for a bar that already pays through one of them, and Rail's pitch is that Rail works out tips and pay. $30 a month is generous.
- **Risks:** money: an export that double-pays tips (tips already in net) is a pay error. Privacy: files contain pay and possibly bank details; keep bank fields out of any generic export. Tenancy: the same.
- **Honest note:** weaker than it sounds. With direct deposit off the table, a bar either uses Rail's bank file or already runs payroll elsewhere. The second type is the bar Rail should talk to first about hours and tips only. One CSV of per-employee hours, wages, tips and cash tips with plain headings covers most of this at the cost of 1 day; do that and stop.

## 9. Native phone app pieces

- **Exists:** `2026-11-25-native-app-architecture.md` (SwiftUI, server-computed money, `/api/v1`), `app/api/v1/me`, `2026-11-25-native-manager-plan.md`.
- **Missing:** nearly everything, plus owner-only Apple steps, and the spec itself says approving pay is not in 1.0.
- **Value reasoning (estimate):** push and offline counting are real, but the web app already has web push, a staff portal and a manifest, and iOS web push works after Add to Home Screen. Roughly $50 a month, for 30 or more days of work and an App Store review cycle for a one-person company with no legal entity yet.
- **Recommendation:** defer. If one piece is worth earlier, offline count (B on a phone) is it, and B's web version should come first.

## 10. Self-serve trial, data export and deletion, status page

Split three ways because they are different in kind.

- **10a. Working data export and account deletion (5 days).** Not a feature that raises value; it is a promise already on the site. `claims-register.md` A34 says the "export it at any time ... delete within 30 days" line is UNSUPPORTED: the only user deletion is the demo purge (`lib/demo/purge.ts`). Needed also for App Store (the native spec says in-app deletion must be built). Risks are high and money-adjacent: deletion must remove an org's rows across about 30 tables without orphaning `memberships` (see the demo-sweep lesson in AGENTS.md), keep tax records as required (counsel decides retention), and be owner-only with a confirmation. Export is easier: a zip of per-table CSVs built from `createClient()` (RLS applies). Do before the first paid bar, or soften the site wording as A34 suggests.
- **10b. Self-serve trial (8 or more days, blocked).** `onboarding-checklist.md` says there is **no public owner sign-up screen**: `/join` is staff-only, owners arrive through a magic link that depends on an unverified Supabase setting, or the founder creates them by hand. Billing code exists (`lib/billing`, `app/api/billing/*`) but is not live, there is no legal entity to contract with, and the first customers are local bars the founder can onboard in person. Self-serve adds support load the one founder cannot meet. The owner's request that the sign-up flow be unblocked is its own piece of work and is not costed here. Fix the walk-through gaps first; add a trial when billing is live and a legal entity exists.
- **10c. Status page (0.5 day).** Use a hosted page pointing at the Vercel deploy and Supabase; no code in the repo. Of little value to a bar until there are many of them. The `pos.feed_stale` alert (A) does more for trust.

---

## Clover and Toast: the dependency table

| Idea | Depends on the other workflow? | What exactly |
|---|---|---|
| A feed quiet | Small | Provider-neutral sync health fields |
| 2 night tie-out | **Yes** | `cash_sales` and `card_sales` filled by each adapter; degrade to "not reported" if not |
| 6 weekly summary | Low | Reads normalized sales |
| B count session | No | Depletion rates differ by provider, not the screen |
| 3 comparison | No | |
| 4 suggested orders | Low | POS item sales through pour conversion |
| 1 variance | Medium | Item mapping and pour sizes |
| 5, 7, 8, 9, 10 | No | |

## What I did not do

- No live bar data, no running app, no demo cookie jar (judged from source only).
- Did not read Clover or Toast payloads, QuickBooks, Xero, Gusto or Square import specs, or Groq's model list. All of those are marked unverified above.
- Did not check whether `inventory_items` has a rep link (affects idea 4's size).
- Dollar figures rest on the assumptions at the top and are not evidence. Ask three or four first-bar owners what their close and ordering take, and replace them.
