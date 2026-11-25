# Rail pricing and packaging (draft G4)

Date: 2026-11-25. Drafted for the founder; the manager reviews it before it is final. Status: **every number in this document is a HYPOTHESIS** unless it carries a competitor citation, and none is final. `TODO(owner)` marks what only the owner can supply. Nothing here has been sent, published, quoted or charged.

**The app has no purchase UI. The subscription is sold on the web (by invoice at first), at one price, and the phone app contains no price, plan picker or upgrade screen** (native spec, section 4, guideline 3.1.3(c); how App Review reads this is UNVERIFIED).

**Ten-minute read:** sections 2, 3, 4 and 6. Reference: 1, 5, 7 to 10.

Sources inside the repo: `docs/go-to-market/strategy.md` (decisions 3 and 5), `docs/superpowers/findings/competitors/matrix.md` and the ten competitor files, `docs/go-to-market/claims-register.md`, `docs/go-to-market/battlecards.md`, `docs/superpowers/specs/2026-11-24-rail-rebuild-design.md` (Monetization, Packages), `docs/superpowers/specs/2026-11-25-native-app-architecture.md` (Decision 5, section 4), `AGENTS.md`. No live competitor page was re-read for this draft: the matrix was read the same day (2026-11-25), so nothing is known to have changed. **Re-read each live page the day a quote goes out.**

---

## 1. What competitors reportedly charge (read 2026-11-25, USD)

Rule for this table: a figure is a report with a date and a doubt, never a fact about today's price. Do not quote any of it to a bar.

| Product | Reported figures | Reliability (copied from the matrix and the product's file) |
|---|---|---|
| Toast | About $0 / $69 a month software tier, add-ons $30 to $50; card-processing fees on top | **Third-party snippets only; Toast's own pages returned 403.** Indicative at best. Not used to set any Rail price. (`toast.md`) |
| MarginEdge | $350 a month per location ($315 on annual); add-ons: scale +$150, Toast API pass-through 10% | From its own pricing page, may have changed; other fees such as onboarding are unstated. (`marginedge.md`) |
| BevSpot | Annual tiers: Starter $948 a year, Standard $1,428 a year | A Pro price of "$249/yr" is below Starter and was **treated as a page error**; per-location basis unverified; third parties disagree (for example $99 to $219 a month, from $68 a month). Do not quote. (`bevspot.md`) |
| WISK | $249 (beverage) or $399 (food and beverage) per location per month for one venue; implementation $750 and up | Older snippets show $199 / $399, so **which is current is unverified**; a promotion was shown and may have ended. (`wisk.md`) |
| MarketMan | Starter $249, Growth $299, Enterprise "from $449" | Per-unit or per-location basis unverified; contract length and setup fees not stated. (`marketman.md`) |
| Bar Cop | Sources conflict: $87, $124, $149, $189, $249 a month and a $299 one-time figure | **Unresolved.** Its pricing page returned 404. Do not quote. (`bar-cop.md`) |
| 7shifts | Per location: Comp $0 (15 staff), Essentials $39.99, Pro $79.99, Premium $134.99 (annual); tip management add-on $49.99 | Its site served only a JavaScript shell; figures come from `llms.txt` and a comparison page; the payroll per-employee fee is unverified and sources disagree. (`7shifts.md`) |
| Restaurant365 | Quote only. One third-party figure of $435 per location per month | Dated June 2024, possibly stale; a snippet shows a different range, unverified. (`restaurant365.md`) |
| Square for Restaurants | Per location: Free $0, Plus $49, Premium $149; payroll $35 plus $6 per person | From Square's own pages, but the bars page was a 404, some pages were truncated, and regions and fees vary. (`square-restaurants.md`) |
| Lightspeed Restaurant | Starter 69, Essential 189, Premium 399 | Billing period not stated on the page; "monthly" is assumed from third-party snippets. KDS $30 per screen. (`lightspeed.md`) |

**What the table supports, no more:** the inventory specialists reportedly cluster at roughly $250 to $450 a month per location, several with setup fees; the labor tool and the POS-bundled plans have cheaper entry points where the real price is processing or add-ons. Every figure is indicative (matrix, "Price takeaways").

**Not found in any competitor read:** a published price for a product that joins stock, pay with tip pooling and Z-report analytics for one bar. That is an absence on marketing pages, which is weak evidence (matrix, first paragraph).

---

## 2. The price model, and what was rejected

**Chosen (HYPOTHESIS, from strategy decision 3):** one flat price per bar per month. No per-employee fee. Nothing metered. No free tier. Annual prepay deferred. Month to month. No setup fee for the first ten bars.

| Alternative | Why rejected for now | What would reopen it |
|---|---|---|
| Per employee | An owner cannot predict the bill, and it is what payroll tools charge and owners resent (strategy). It also punishes the bars with the most seasonal staff. Square's reported $6 per person (section 1) is the shape to avoid. | A pilot bar so large that one flat price loses money (see section 7). |
| Per module a la carte | Four items to choose from on a call is too many; Books is not worth buying without Stock (strategy). Also needs an entitlement table that does not exist. | Paying bars asking for a stock-only or pay-only plan (section 9). |
| Percentage of payroll or of sales | Rail does not touch the money (`/terms`; the bar's own bank sends it). Charging on the money processed would invite the question of whether Rail handles it, and a share of sales makes the price rise on the best nights, which reads as a tax on success. The strategy already rules out a card-processing share ("Rail is not a POS"). | Never in the current design. |
| Freemium or a free tier | One person cannot support free bars when each needs a program installed on its POS computer (strategy). A free bar still costs a visit and database rows. | Self-serve signup exists and the support load is measured (section 7). |
| Metered (AI parsing, texts) | Predictability is the pitch. Those costs are watched internally, not billed. | Cost per bar from section 7 shows one bar's usage is far out of line. |
| Annual prepay now | Prepaying a year to an unproven vendor is a refund problem. If ever offered: two months free, refundable pro rata (strategy; the two-months figure is a HYPOTHESIS). | Five bars have paid monthly for three months (strategy decision 5; both numbers HYPOTHESIS). |

**Cheapest test of the model itself:** in the first ten conversations, ask "if the price were per employee, would that change your answer?" Record it in the section 6 table. HYPOTHESIS: if most say a flat price is easier, the model stands.

---

## 3. The two bundles, mapped to what exists

The mechanism is the rebuild spec's four modules (Stock, Sales, Team & Pay, Books). The strategy sells two bundles on top. **There is no billing or entitlement code today** (a search for plan, tier and entitlement found nothing, rebuild spec "Packages"), so for the first ten bars everyone gets everything and nothing needs enforcing.

| Bundle | Spec modules | In plain words | HYPOTHESIS price |
|---|---|---|---|
| **Close** | Sales, Team & Pay | Reads the night's Z report from the 2Touch the bar already runs, works out the tip split and the pay run for the owner to check and approve, and locks the bank file until an owner approves. | $99 a bar a month |
| **Whole bar** | Close, plus Stock, Books and rep ordering | Everything in Close, plus stock that moves with POS sales, delivery costs taken from the invoice, books figures, and orders to supplier reps by email or text with a history. | $199 a bar a month |

Why these numbers (reasoning, not evidence): Close sits below 7shifts' reported $79.99 to $134.99 plus $49.99 for tips only if one counts that tool's scheduling and payroll filing, which Rail lacks; Whole bar sits under the reported inventory specialists ($249 and up) while including pay (section 1, all indicative). The $99 and $199 figures are strategy decision 3, **HYPOTHESIS, unproven**.

### Module-by-module: what may be sold today

Verified against `claims-register.md` (verdicts A14 to A19, B1, B5), `AGENTS.md` and the app's routes (`app/(app)/app/` has `sales`, `tips`, `payroll`, `inventory`, `books`, `reps`, `tax`).

| Module | Exists in code | Sellable today? | What must be true first |
|---|---|---|---|
| Sales (Z report analytics) | Yes (`lib/pos/*.test.ts`) | **With a limit.** Say "reads your 2Touch Z report". Not "instant" or "real time" (A16). | Only 2Touch (and Clover, unverified, A22) may be named. Windows POS computer, agent install (A25, A27). |
| Team & Pay: tips and pay run | Yes (`lib/payroll/tip-pool.ts`, `run-diff.ts`) | **With a limit.** Say "worked out for you to check and approve" (A15, B1). | The two real-data checks that tips reconcile to the Z report are done (B5: do not say it to a customer yet); the Payroll Review "Confirm Payroll" button issue fixed (B1). Never "payroll" in a way that implies withholding, filing or paying. |
| Stock | Yes (POS sales deplete stock; deliveries cost from the invoice) | **Not yet as a promise of accurate stock.** Offered as the second step after the first approved pay run (strategy). | Container size and pour size or recipe set for each item; until then depletion does not convert drinks to bottles. Low-stock alerts run once a day, not instantly (A14). |
| Books | A `books` area exists (`app/(app)/app/books/`) | **Not yet: no claims-register row covers it, and its figures depend on Stock being set up.** Include it in Whole bar for the founding ten without describing results. | A register verdict on Books, and Stock setup finished for that bar. |
| Rep ordering | Yes (`lib/reps/email.ts`, `sms.ts`; A17 is TRUE) | **Yes**, as "orders to supplier reps by email or text, with a history". | Mail and text credentials set for the deployment. Not "auto-reorder" (A18). |
| Payroll tax withholding and filing | Withholding code exists but is switched off and unchecked | **Never sold.** "Rail does not file taxes, withhold taxes, or hold or move your money." | Checked against official tables, plus a decision by the owner and counsel. |
| Tax and W-2 drafts | Screens exist (A19, PARTLY) | **Not sold** as a feature; do not describe until the register verdict changes. | Register verdict. |
| Toast connection | Code only, never run against an account | **Refused.** UNSUPPORTED (A21). | A real-account test and a PRODUCT.md change. |
| Clover feed | Code only, never exercised (A22) | **Refused** as a selling point; accepted if a Clover bar asks. | A real or sandbox run on record. |
| Native phone app | Not built | **Refused.** | Built and passed review. |
| QuickBooks or Xero sync, multi-location, self-serve signup, online billing | None exist | **Refused.** | Built. |

**Refusals in this draft, in one line:** Toast, Clover as a feature, tax filing or withholding, accurate-stock promises, any result from Books, native app, QuickBooks or Xero, multi-location, self-serve checkout.

---

## 4. The founding offer for the first ten bars

HYPOTHESIS (strategy decision 3). "Ten" is real, not a sales device: it is the number of bars the founder can install and support alone (strategy; the capacity limit is itself a HYPOTHESIS). That is why "founding" and "ten" may be said out loud.

**Terms in plain words**

1. Everything included: both bundles.
2. The first 30 nights are free, counted from the first synced Z report (not from the visit, not from signing). HYPOTHESIS that 30 nights gives about four closes, enough to see the value (strategy).
3. After that, a founding price, held for 12 months, month to month, cancel any time. HYPOTHESIS ladder: bars 1 to 3 at $99, bars 4 to 6 at $149, bars 7 to 10 at $199 a month. Say openly that earlier bars pay less.
4. No setup fee. HYPOTHESIS: ask bars 6 to 10 what they would have paid for setup (strategy decision 5).
5. In return: a 20-minute call each month (HYPOTHESIS; its cost is founder time).
6. The bar's money stays the bar's: Rail does not file taxes or move money, the numbers must be checked by the bar (`/terms`).

**The exact test**

| | |
|---|---|
| Question | Will a bar that has seen about 30 nights of its own data pay the founding price without bargaining? |
| Measure | For each of the first five activated pilots, record on night 31: invoice sent (date), paid within the agreed days (yes or no), asked for a lower price (yes or no, what number). "Activated" is defined in strategy section 7. |
| Pass (HYPOTHESIS) | 3 of the first 5 pay without bargaining: the next step of the ladder stands. |
| Fail (HYPOTHESIS) | Fewer than 2 of 5 pay: the problem is value, not price, and the price is not cut. Find out what the bar did not see. |
| In between | 2 of 5: ask the other three one question: "what would have to be true for you to pay?" Do not change the price on this evidence. |
| Cost | Five invoices and five short calls. |

A bar that is not a 2Touch, single-location, owner-present bar is outside the offer (strategy decision 1).

---

## 5. How payment works at first

**Mechanism (HYPOTHESIS, strategy):** a Stripe invoice or payment link, sent by the founder by hand. No billing code, no Stripe Billing, no packages table for the first ten bars (manager plan, finding 4).

**No price on the website** until a payment link works and three bars have paid (HYPOTHESIS thresholds, from strategy and the rebuild spec). The front page claim "$0 Extra for payroll reports" (A10) and any "from" price are to stay off the site.

**The consequence of having no billing code today:** nothing can be charged automatically. Everything below is manual: sending the invoice on night 31, noting who paid, ending a pilot, a refund. The founder must keep a hand record (the metrics sheet) or a bar will be billed wrongly or twice. Failed payments, receipts and cancellation are Stripe's defaults, not Rail's. This is acceptable for ten bars and not beyond. Build triggers are in section 9.

**What the owner must supply before the first invoice (all `TODO(owner)`)**

| Item | Status |
|---|---|
| Legal entity that issues the invoice | `TODO(owner)`. `lib/legal.ts` names an entity and Ohio venue that may not be real (claims register, unverified 4). |
| EIN | `TODO(owner)` |
| Business bank account to receive payouts | `TODO(owner)` |
| A Stripe account in that entity's name | `TODO(owner)` |
| Sales-tax treatment of software-as-a-service in Ohio and Kentucky (bars in both states are in the first-customer area) | **Confirm with an accountant.** Not asserted here, and the invoice must not be sent until the answer is known. |
| Contract and refund wording, cancellation terms | **Confirm with counsel.** |
| The domain and a business email (today the site falls back to a `vercel.app` address and a Gmail contact) | `TODO(owner)` |
| Whether the hosting plan permits commercial use | UNVERIFIED (manager plan, finding 3) |

### The one-page quote the founder hands over

> **Rail: quote for [bar name, filled in per bar]**
> Issued by: `TODO(owner: legal entity, address, EIN not printed unless the accountant says so)`
> Date: `TODO` Valid for: `TODO`
>
> **What you get:** [Close / Whole bar: copy the plain-words rows from section 3 only].
> **First 30 nights:** free, counted from the first synced Z report.
> **Then:** `TODO(owner: founding price for this bar's place on the ladder)` a month, held for 12 months, month to month, cancel any time.
> **Setup fee:** none.
> **Tax:** `TODO(accountant: sales-tax treatment)`.
> **How to pay:** invoice from `TODO(owner: Stripe account name)`, card or bank debit. Payment details: `TODO(owner)`.
> **What Rail does not do:** file taxes, withhold taxes, or hold or move your money. You check and approve every pay run.
> **In return:** a 20-minute call each month.
> **This price is for the first ten bars. Later bars may pay a different price.**
> Signed: ______ for the bar. ______ for Rail.

---

## 6. The willingness-to-pay test

Ask in the first ten conversations (strategy: with 2Touch owners the founder already knows, in person). Ask after the owner has seen the demo bar and said in their own words what tips and pay cost them each week. **Do not name a price, a competitor's price or a range before they answer. Ask all four, in this order, one at a time, and write the number down before moving on.**

The script, word for word:

1. "At what monthly price would this be so cheap that you would doubt it could be any good?"
2. "At what monthly price would it be a bargain, clearly worth the money?"
3. "At what monthly price would it start to get expensive, so you would have to think about it, but you might still buy?"
4. "At what monthly price would it be too expensive, so you would not buy it however good it was?"

If they say "it depends", ask once: "For a bar like yours, running as it does now?" If they refuse a number, write "refused" and move on. Do not suggest an answer.

Record sheet (one row per conversation; no names of people or bars in this document; the real sheet lives in the metrics sheet):

| # | Date | Too cheap | Bargain | Getting expensive | Too expensive | What they pay today for tips and pay work (their words) | Per-employee vs flat reaction | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |

**How to read the answers (Van Westendorp style; HYPOTHESIS that ten answers are enough for a direction, not a measurement)**

- Fewer than 10 answers is not a survey. Treat the result as a direction and a list of objections.
- Order the answers by question. The range **from the median "bargain" to the median "getting expensive"** is where the price is likely to be acceptable. If $99 and $199 both sit inside it, the hypothesis survives. If $199 is above the median "too expensive", the Whole bar price is the problem, not the product.
- If a median "too cheap" is near or above $99, the price may signal low quality: raise Close, not lower it.
- Treat any single answer far from the rest as one owner's circumstances, not a price.
- Compare the numbers with what they pay today. If they pay for nothing and the answers are low, the competition is the spreadsheet, not another product (section 10).
- Stated prices are weak evidence of what people will pay. **The real test is the night-31 invoice** (section 4): did they pay, and did they bargain. Where the two disagree, believe the invoice.

---

## 7. Unit economics skeleton (blanks only)

No cost has been measured and none is invented here. The owner supplies each figure (manager plan, "Inputs the owner must supply"; cost per bar is unknown).

| Line | Per bar per month | Source |
|---|---|---|
| Hosting and database (Vercel, Supabase) | ____ `TODO(owner)` | invoices |
| AI parsing (Groq) | ____ | usage |
| Texts (Twilio) and email (Gmail) | ____ | usage |
| Payment fees (Stripe) | ____ | Stripe's current published rates, read on the day, `TODO` |
| Support and install time: founder hours per bar per month | ____ hours | founder's log |
| Founder's time, valued at | $____ an hour `TODO(owner)` | owner's decision |
| Sales tax or other taxes on the subscription | ____ | accountant |

- **Cost to serve per bar** = hosting + AI + texts and email + payment fees + (support hours x hourly value).
- **Margin per bar** = price - cost to serve.
- **Break-even bar count** = fixed monthly costs / margin per bar. Fixed monthly costs: tools and subscriptions, insurance, legal and accounting, owner's target income. `TODO(owner)`.
- **Price floor** = cost to serve / (1 - target margin). `TODO(owner: target margin)`.
- Strategy tripwire (HYPOTHESIS): if cost per bar rises above about a third of the price, reopen the price.
- Also record: the number of bars one founder can support. If the real figure is below ten, the founding ladder's size is wrong.

---

## 8. Discount and refund rules (all HYPOTHESIS)

| Rule | Proposed | Why | Test |
|---|---|---|---|
| Discounts | None beyond the founding ladder. No haggling below the quote. | A discount to the first ten is already built in; ad hoc cuts destroy the test in section 4. | Count the asks in the night-31 record. |
| Founding price | Held 12 months from the first invoice, then re-quoted with 30 days' notice (HYPOTHESIS). | Fairness to early bars. | Ask the first three bars if 12 months is fair. |
| "Limited" language | Only "first ten bars", which is a real limit. No countdowns, no "limited time". | The plan forbids a discount called limited unless the limit is real. | Review wording before use. |
| Free period | 30 nights from the first synced Z report; no card taken before night 31. | Value needs about four closes (strategy). | Did bars see value by night 30? |
| Refund | The first paid month refundable on request, no questions (HYPOTHESIS). Later months not refunded; cancel stops the next invoice. | A trust product with no references needs a low-risk first payment. | Count the refund requests. |
| Cancellation | Any time, effective at the end of the paid month. | Month to month is the promise. | |
| Annual plan | Not offered yet; later "two months free, refundable pro rata" (strategy). | Section 2. | |
| Data on cancellation | `TODO(counsel)`. The site's promise to export and delete data has no code behind it (A34, UNSUPPORTED), so **do not put it in a quote.** | | |
| Non-payment | A reminder, a call, then the bar loses access. The app shows a neutral sentence with nothing to tap (native spec). | Apple rule (above). | |

All refund and cancellation wording: **confirm with counsel.**

---

## 9. What would make us change the price

| Evidence | Meaning | Change |
|---|---|---|
| Fewer than 2 of the first 5 activated pilots pay on night 31 | Value, not price (strategy) | Do not cut the price. Find the missing value; re-test. |
| 3 of the first 5 pay without bargaining | Price is acceptable at this step | Move to the next rung of the ladder as planned. |
| Most pay and several say "that was cheap" | Possible underpricing of a trust product | Raise the next rung; test one higher quote before changing earlier bars. |
| Median "too cheap" answer at or above the price | Price signals low quality | Raise it. |
| Median "too expensive" below the Whole bar price | Whole bar is mispriced | Test a lower Whole bar, or a smaller bundle. |
| Paying pilots ask for a stock-only plan | The bundles are wrong | Reopen packaging; this is the trigger for the packages table. |
| Cost to serve above about a third of the price (HYPOTHESIS, strategy) | Margin too thin | Raise the price or cut support cost. |
| Install and support hours per bar exceed what the founder can give | The price does not fund in-person installs (strategy risk) | Reopen a setup fee for bars 11 onward. |
| A competitor's price changes on a live page | The comparison moved | Re-read all pages; update section 1. |
| App Review demands in-app purchase | The Apple fallback (native spec) | Offer an in-app price beside the web price, or carry the commission; the commission rate is UNVERIFIED. |
| Three bars have paid and a payment link works | Publish a price on the site (HYPOTHESIS thresholds) | Publish, with counsel's wording check. |
| Five bars have paid monthly for three months, or the founder is hand-invoicing more than ten bars | Manual billing breaks | Build Stripe Billing, then the packages table (the two builds are separate triggers; build only what is needed). |

---

## 10. Pricing risks

1. **Underpricing a trust product.** Pay and tips are what a bar owner cares most about getting right; a low price can read as untrustworthy. The test is the "too cheap" question and the night-31 invoice. The strategy flags that $99 may be too low to fund in-person installs.
2. **Anchoring to POS-bundled prices.** Square and Toast reportedly include payroll or inventory at low entry prices (section 1), but the real price there is processing and add-ons, and those bars are outside the first target (strategy). A bar owner may still compare Rail against "free". The answer is the fact that Rail does not require a POS switch, not a price war. Do not state a competitor's price to the bar (section 1 reliability).
3. **Free competitors.** Square's included features and 7shifts' free Comp tier (section 1) mean some of the job has a free alternative. Rail should not compete on "cheaper" and should not offer a free tier of its own (section 2).
4. **The real competitor is the spreadsheet.** Owners who work out tips by hand pay nothing today. The price has to be set against their hours, not against another vendor. That comparison needs the owner's own hours, which are not on record: ask, do not assert.
5. **Owners talk.** Earlier founding prices are lower; say so openly (strategy). A bar finding out later feels cheated.
6. **A published price nobody can pay is a promise the product cannot keep** (rebuild spec). Hence no site price until a link works.
7. **Quotes carrying a competitor's price become a legal and trust risk** if the figure is stale or wrong. Section 1 doubts apply.
8. **Sales tax and entity are unknown.** An invoice sent before they are settled may need re-issuing.
9. **Apple.** Treating the sale as business-to-business and direct fits guideline 3.1.3(c) better than public checkout, but whether App Review agrees is UNVERIFIED.
10. **The first ten bars are not a market sample.** They are 2Touch bars the founder knows; their willingness to pay may be higher or lower than strangers'.

---

## Unverified

1. Every price and threshold in this document (all HYPOTHESIS).
2. Every competitor price (section 1 doubts); Toast, Bar Cop, BevSpot, WISK, Restaurant365 and 7shifts worst.
3. Sales-tax treatment of the subscription in Ohio and Kentucky: accountant.
4. Refund, cancellation and data-export wording: counsel.
5. Whether the hosting plan allows commercial use.
6. Whether Books is ready to describe (no claims-register row).
7. Whether App Review accepts the web-only sale.
8. Cost to serve and the founder's real capacity: owner.
9. Whether 30 nights yields enough closes to see the value.
