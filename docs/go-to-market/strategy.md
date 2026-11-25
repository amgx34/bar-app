# Rail go-to-market and monetization strategy

Date: 2026-11-25. Written by the general manager agent for the owner. Status: decided under delegation, every decision reversible by the owner. Branch `rebuild/foundation`. Nothing here has been sent, published, charged or built.

**How to read this.** The ten-minute read is sections 1, 2 and 8: the decisions, what is true about the product, and what to fix before selling. The rest is reference for when a decision is questioned. Sections 3 to 9 give, for each decision: the options, the choice, the reason, the risk, and what would change it. Section 10 lists what could not be verified. The work queue and the owner's to-do list are in `docs/superpowers/findings/2026-11-25-gtm-manager-plan.md`.

**Three words used throughout.** HYPOTHESIS: a number or belief nobody has tested; each comes with a cheap test. UNVERIFIED: something I could not confirm from the code or a public page. CONFIRM WITH COUNSEL: a rule as I read it on a public page, not legal advice.

---

## 1. The decisions on one page

| # | Decision | In one line |
|---|---|---|
| 1 | Who buys first | Independent, single-location bars on the **2Touch POS** around Cincinnati and Northern Kentucky, where the owner or one manager works out tips and pay by hand after close. |
| 2 | The promise | Category line stays "one app for the whole bar". The line used with a 2Touch owner is sharper: **"Rail closes your night: the Z report, the tip split and the pay run, straight from the 2Touch you already own."** |
| 3 | Price | Per bar, per month, flat. No per-employee or per-seat fee, nothing metered. HYPOTHESIS: $99 for the nightly close, $199 for the whole bar. The first ten bars get everything, free for 30 nights of real data, then a founding price that steps up as places fill ($99, $149, $199). Sold on the web by invoice; no price inside the phone app. |
| 4 | How it is sold | By the founder, in person and through people who already know the bar. **Cold calls and cold texts are on hold until a lawyer answers three questions** (section 5). Lowest-risk channels first: the founder's own bar as the proof, warm introductions, walk-ins in quiet hours, the demo bar on the website. |
| 5 | Other revenue | None for now. No payments, no payroll provider, no referral fees, no annual prepay, no setup fee. Each is deferred with the condition that would reopen it. |
| 6 | What to measure | Seven numbers in a spreadsheet, updated weekly from six read-only queries. A bar counts as **activated** when its first Z report has synced from its own POS and its first pay run has been approved. |
| 7 | What must be fixed first | Do not charge a stranger until the Payroll Review approval screen, the role fix on live, the real-data tips check, the unbacked claims on the front page and the Books zero-cost display are dealt with (ranked list in section 8). |
| 8 | Documents to write | Nine, in `docs/go-to-market/` (section 9). Drafted by agents, each claim sourced or labelled. |

**The single most important sentence:** the plan for the next 30 days is to make the product true for one stranger's bar, not to find more strangers.

---

## 2. What is true about the product today

Positioning is built only from this list. Sources: `AGENTS.md`, `PRODUCT.md`, the code, the overnight log.

**Real today**

- A Windows agent on the bar's POS computer reads 2Touch and sends Z reports, employee-week data and the item audit every five minutes. An emailed nightly report is the fallback.
- Tip splits: pooled by hours, individual, and percentage-of-sales modes, barback cuts, an opener bonus. A hand-entered cash tip count is never overwritten by the POS.
- A pay run is frozen when it is submitted; an owner approves it; the bank file (NACHA) is locked until approval, unless an owner overrides it and writes down why. The bar's own bank moves the money. Rail never holds or moves funds (`/terms` says so).
- POS sales reduce stock, converted from drinks to bottles through pour sizes and recipes. A delivery's cost is what the invoice charged.
- Alerts: low stock, nightly sales, sales anomaly, pay run waiting for approval.
- Orders to supplier reps by email or text, with a history.
- A demo bar anyone can open from the website with no signup.
- The money arithmetic is covered by automated tests (1,220 passing at the last gate).

**True with a limit**

- "The night's tips reconcile to the Z report": true in tests and on the demo bar after a fix made this week. Two checks on real data are still waiting for the owner (overnight log, morning list item 3). Not to be said to a customer until done.
- Clover: the spec lists it as a live feed. I did not see it exercised.
- Stock depletion works only once each item has a container size and a pour size or recipe. That setup takes real work per bar.

**Not real, or not proven. Never to be claimed.**

- Any customer, testimonial, time saved or money saved. None exists on record.
- Toast. Connection code exists (`lib/toast/`), but `PRODUCT.md` allows only 2Touch and Clover to be claimed and nobody has run it against a real Toast account. **The front page claims it today.**
- Payroll tax filing or withholding. Rail calculates; it does not file. The withholding code is unchecked against official tables and switched off.
- A native phone app, QuickBooks or Xero sync, multi-location reporting, self-serve signup, online billing. None exists.

**Front-page lines that fail this test** (`app/page.tsx`): "5 hrs saved per week on average" and "28+ inventory items tracked" (no source), "100% automated tip calculations" (cash tips are typed in), "Up and running in minutes" and "under an hour" (never measured; the agent needs installing and mapping), "Clover, Toast, or 2TouchPOS", "Built for every type of venue" (hotels, breweries, restaurants are undecided), "export it at any time" and "we delete within 30 days" (no account-deletion code exists; a full export was not found). Work item G1 lists every claim with a verdict.

---

## 3. Decision 1: the wedge and the first customer

**Options considered**

| Option | For | Against |
|---|---|---|
| A. Bars on 2Touch | The feed is native and installed by us. Of ten competitors read, only Restaurant365 names 2TouchPOS (weak evidence). 2Touch sells to "high-volume bars" and says the bar owns the system outright (2touchpos.com, read 2026-11-25), so these owners will not change POS to get Toast's bundled payroll. The founder's own bar runs it. | Number of 2Touch bars is UNVERIFIED. Rail depends on a database another company controls. |
| B. Any independent single bar | Larger pool. | No working feed for most POS systems; the upload path is weaker and the pitch becomes generic. |
| C. Small groups (2 to 5 bars) | More revenue per sale. | One organisation is one bar; the bar switcher is missing; Restaurant365 and WISK already serve groups. |
| D. Owners doing tips and payroll by hand | The pain is nightly and the value shows on night one. | It is a behaviour, not a list you can find. |
| E. The owner who is not a software person | That is most of them. | It is a design constraint, not a segment. |

**Choice: A, narrowed by D, designed for E.** A 2Touch bar within a short drive, one location, owner present, tips pooled, pay worked out by hand. Lead with the nightly close (Z report, tips, pay run). Stock is the second step, offered after the first approved pay run, because it needs weeks of setup before it pays back.

**Why they switch.** HYPOTHESIS: the tip split is done late, by hand, and gets disputed; the owner does not fully trust the pay figures. Test: ask ten owners to show how last night's tips were split. Count how many use paper or a spreadsheet and how long it took.

**Not targeted yet:** groups, restaurants that need food costing, bars on Toast or Square (they already have bundled payroll), hotels, breweries and nightclubs, any bar beyond a drive, any bar wanting payroll taxes filed for it, any bar with no POS feed. A Clover bar nearby that asks is accepted; none is sought.

**Risks.** (1) The 2Touch pool may be too small to matter. (2) 2Touch could change its database, object, or build this itself. Whether a bar's 2Touch licence allows a third-party program to read its database is UNVERIFIED: CONFIRM WITH COUNSEL before approaching 2Touch as a partner. (3) Leading with tips means the first thing a customer checks is the thing that had a double-count bug last week.

**What would change it.** Fewer than 5 of 20 conversations with 2Touch owners leading to a pilot (HYPOTHESIS threshold): then test Clover bars, or lead with stock instead of the close.

---

## 4. Decisions 2 and 3: the promise and the price

### The promise

Options: (a) "one app for the whole bar", which the owner has confirmed (`PRODUCT.md`); (b) lead with the 2Touch feed; (c) lead with trust ("figures you can check").

**Choice: keep (a) as the public category line; use (b) in conversation with 2Touch owners; prove it with (c).** `PRODUCT.md` reserves stronger claims until the owner agrees, so (b) is a default for the owner to confirm.

The competitor evidence says: none of the ten products read shows inventory, payroll with tip pooling, Z-report analytics and rep ordering together for one bar at a small-bar price. That rests on public pages, several of them blocked. So the claim is worded as **"we have not found another tool that does all four for a single bar"**, never "the only".

Proof used in place of testimonials: the demo bar; the founder's own bar with its real numbers, once the owner agrees in writing which numbers; the plain statement of what Rail does not do (it is in `/terms` already and it builds trust).

### The price

Evidence (`findings/competitors/matrix.md`, all indicative): inventory specialists $249 to $449 a bar a month, several with setup fees of $750 or more; 7shifts $0 to $135 plus $50 for tips; Square payroll $35 plus $6 a person.

| Question | Choice | Reason | Risk |
|---|---|---|---|
| Model | Flat per bar per month | A bar owner can predict it. Per-employee fees are what payroll tools charge and what owners resent. | Leaves money on the table at big bars. |
| Packaging | Keep the spec's four modules as the mechanism; sell two bundles: **Close** (sales, tips, pay) and **Whole bar** (adds stock, books, rep ordering) | Four items to choose from on a call is too many, and Books is not worth buying without Stock. | The owner chose "packages designed around each bar": this narrows that. Flag if wrong. |
| Price | HYPOTHESIS Close $99, Whole bar $199 | Close sits under 7shifts' full stack because Rail does not file taxes or schedule. Whole bar sits under every inventory specialist while including pay. | Too low to fund in-person installs; too high for a product with no references. |
| Trial | No self-serve trial. The demo bar, then 30 nights free on the bar's own data, counted from the first synced Z report | No signup or billing exists; value needs about four closes. | A free month with no card costs the founder a visit. |
| Free tier | None | One person cannot support free bars with a program on each POS computer. | |
| Metered | Nothing | Predictability is the pitch. Watch AI parsing and text costs internally. | |
| Annual plan | Deferred | Prepaying a year to an unproven vendor is a refund problem. If ever offered: two months free, refundable pro rata. | |
| First ten bars | Everything included, 30 nights free, then a founding price held for 12 months: bars 1 to 3 at $99, 4 to 6 at $149, 7 to 10 at $199. Month to month. No setup fee. In return: a monthly 20-minute call. | Giving all ten everything means no entitlement table has to be built yet, and the rising price is itself the willingness-to-pay test. | Owners talk; "earlier was cheaper" must be stated openly. |
| How they pay | An invoice or payment link from Stripe, sent by the founder | No billing code needed for ten customers. | Needs a legal entity and a Stripe account (owner). |
| Price on the website | Not yet (the spec's rule). Publish when a payment link works and three bars have paid | | Self-serve visitors bounce without a price. |
| Apple | One price, set on the web, no purchase screen in the app (native spec, guideline 3.1.3(c)) | Selling by invoice after a conversation fits "sold directly to organisations" better than a public checkout. | How App Review treats this is UNVERIFIED. |

**Cheapest test of willingness to pay.** In the first ten conversations ask four questions: at what monthly price would this be so cheap you would doubt it, a bargain, getting expensive, too expensive. Then the real test: on night 31, send the invoice. HYPOTHESIS: if 3 of the first 5 activated pilots pay without bargaining, the next step of the ladder stands; if fewer than 2 pay, the problem is value, not price, and the price is not cut.

**What would change it.** Paying pilots asking for a cheaper stock-only plan; costs per bar (owner to supply) above about a third of the price; App Review demanding in-app purchase.

---

## 5. Decision 4: how one founder sells it

The spec's intent was cold calls and social media. **I am reordering that**, because of what the public rules say and because trust products sell through people.

**The rules as read on 2026-11-25. CONFIRM WITH COUNSEL before any call or text.** Pages were read through a summarising tool, not word for word.

- **Federal calls.** The FTC says most calls from a seller to a business are exempt from the Telemarketing Sales Rule (ftc.gov, "Complying with the Telemarketing Sales Rule"; first half of the page read).
- **Ohio.** The state's telephone solicitor law exempts business-to-business sales only under listed conditions, such as three years under the same name with 51% repeat sales (Ohio R.C. 4719.01(B)(12), codes.ohio.gov). A new company does not obviously qualify, and a seller that is not exempt may have to register. This is the main reason calls are on hold.
- **Kentucky.** The Attorney General's page describes rules for calls to residential and mobile numbers and a No Call list; a "merchant" must obtain the list (ag.ky.gov, "Information for Telemarketers"). Many bar owners answer on a personal mobile.
- **Texts.** Under the federal rule a text counts as a call, and marketing texts or calls sent with an autodialer to a mobile need prior express written consent (47 CFR 64.1200, via law.cornell.edu). The FCC's own guide blocked the read. **No cold texts, ever, and never from Rail's own Twilio number.**
- **Email.** CAN-SPAM has no business-to-business exception: honest headers and subject, a real postal address, a working opt-out honoured within 10 business days (ftc.gov, CAN-SPAM compliance guide). Rail has no postal address on record.

**Channels, lowest risk first**

1. **The founder's own bar** as the worked example: real nights, real numbers, with the owner's written say-so.
2. **Warm introductions** from bar owners the founder knows, and from the supplier reps who already visit them. No referral fees: alcohol trade rules on what suppliers may give retailers are UNVERIFIED here, CONFIRM WITH COUNSEL.
3. **Walk-ins** on Tuesday to Thursday afternoons, with a one-page leave-behind and the demo on a phone.
4. **Inbound.** The front page, the demo bar and the demo request form already exist and already record where a lead came from.
5. **Accountants and bookkeepers who serve bars**, after three paying bars: Rail has an accountant role, and one bookkeeper reaches several bars.
6. **Individually written email** to a bar's published business address, once a domain and postal address exist.
7. **Later, not now:** 2Touch itself (it appears to sell direct through its own trained reps; no dealer network was found), associations, trade events, paid ads, cold calls.

**The first ten.** Bar 1 is the founder's. Bars 2 to 4 are owners the founder knows by name. Bars 5 to 8 are introduced by those owners or their reps. Bars 9 and 10 come from walk-ins or the website. One install at a time, never more than two new bars in a week.

**A week, assuming about ten hours for selling (HYPOTHESIS; the owner sets the real number).** Monday: update the numbers, follow up. Tuesday and Wednesday afternoon: visits. Thursday: one install or onboarding visit. Friday and Saturday: no selling, bars are busy; record one short clip from the week. Every day: answer inbound within a business day, because the page promises it.

**What would change it.** Counsel clears calling Ohio business lines: calls move up to channel 4. Warm introductions run dry before bar 5: test email, then calls.

---

## 6. Decision 5: money beyond the subscription

| Idea | Trust or compliance cost | Decision |
|---|---|---|
| Rail sends the payroll money (payout rail) | Checks on every bar, returned payments, fraud, possible licensing | **Defer.** The spec already chose "the bar's bank sends it". Reopen when three paying bars cannot use the bank file. |
| Embedded payroll provider that files taxes | Replaces Rail's own engine; changes who is responsible | **Defer** to the same trigger. |
| Card processing share | Rail is not a POS | **No.** |
| Referral fee from a payroll or bookkeeping firm | Recommending a provider while calculating pay muddies responsibility | **Defer** until ten bars; disclose any fee. |
| Paid placement for suppliers in rep ordering | Breaks trust; trade rules UNVERIFIED | **No.** |
| Setup or onboarding fee | Competitors' setup fees read as dealbreakers | **Not for the first ten.** Ask bars 6 to 10 what they would have paid. |
| Annual prepay | Refund exposure | **Defer** until five bars have paid monthly for three months. |
| Selling data or benchmarks | `/terms` promises the data is not sold or reused | **Never**, unless the terms change first and openly. |

---

## 7. Decision 6: the numbers and the first 90 days

**What the code records today.** Demo requests with their source (`demo_requests`), page views (Vercel Analytics, no custom events), when each bar was created, each bar's last sync time, summary, errors and agent version (`pos_config`), nightly Z rows, pay runs with submit and review times. **What it does not:** no event log, no plan or trial dates, no billing, no churn reason. Nothing is added now: ten customers fit in a spreadsheet.

| Number | Kind | Where it comes from | HYPOTHESIS threshold |
|---|---|---|---|
| Conversations with 2Touch owners per week | Leading | By hand | 10 |
| Pilots started | Leading | New non-demo bars | 1 every two weeks |
| Days from install to first synced Z report | Leading | `pos_config`, Z rows | Same day |
| Days from first Z to first approved pay run | Leading | `payroll_runs` | 14 or fewer |
| Weekly active bars: a Z night synced and a person submitted, approved or counted in the last 7 days | Leading | Existing tables | 4 of 5 paying bars |
| Pilot to paid | Lagging | Stripe, by hand | Half of activated pilots; report counts, not percentages, below ten |
| Bars lost, with one reason from a fixed list | Lagging | By hand | Learn, no target |

Two watch items beside these: bars whose sync is stale or bringing nothing back (the dashboard already works this out), and the count of wrong money figures a customer finds. The target for the second is zero.

**Days 1 to 30: make it true.** Owner steps (entity, counsel, live checks). The fixes in section 8. The nine documents. Ten conversations asking how tips are done and the four price questions. Nothing is sold.

**Days 31 to 60: three pilots.** Installed in person, one at a time. First approved pay runs.

**Days 61 to 90: ask for money.** Three invoices on night 31. Pilots 4 to 6. Then decide: the price ladder, the public price, calling.

**Stop rules.** Fewer than 5 pilots from 20 conversations: the segment or the lead offer is wrong. Fewer than half of pilots reaching an approved pay run in 14 days: stop adding bars and fix onboarding.

---

## 8. Decision 7: fix before selling

Ranked by how badly each would embarrass Rail in front of the first ten. Sources: `findings/critique/summary.md`, the overnight log, the walk findings.

| # | What | Why it ranks here |
|---|---|---|
| 1 | **Payroll Review.** A "Confirm Payroll" button that saves nothing beside the real approval; an Approved badge over figures that keep recalculating; no approver, date or total shown | It is the centre of the offer and it is about pay. Needs the owner's rules first. |
| 2 | **The role fix (A1) confirmed on live and deployed**, and the six tables with row security off checked on live | A manager treated as owner could approve pay and export the bank file. |
| 3 | **The two real-data tips checks** | Overpaying tips at a customer's bar is the worst first week possible. |
| 4 | **Front-page claims** listed in section 2 | Caught in the first conversation by anyone who knows bars. Cheap to fix. |
| 5 | **Books shows no cost data as 0.0% pour cost and 87.4% profit** | A new bar has no costs entered, so this is what every new customer sees. |
| 6 | The same "silence shown as zero" on Sales and Inventory | Same reason. |
| 7 | **Open doors:** any signed-in user, a demo visitor included, can trigger the cross-bar mailbox poll; the cron route is open if its secret is unset | Not visible to a customer until it is very visible. |
| 8 | Phone layout collisions on the payroll day view | The owner closes the night on a phone. |
| 9 | Promises on closing an account and exporting data that the code does not yet keep | Either build them or soften the words. |
| 10 | No setup checklist for a new bar; navigation still about 36 routes | Softened because the founder onboards the first ten in person. |
| 11 | Voided shipment looks live; stock filter chips do nothing | Small, visible. |

**Gates.** No install at a stranger's bar before 1, 2, 3 and 7. No invoice before 1 to 5. Not needed for the first ten: online billing, the packages table, the native app, the navigation rebuild.

---

## 9. Decision 8: the documents

All under `docs/go-to-market/`. Full briefs are in the plan file.

| File | For | Must contain | Owner must supply |
|---|---|---|---|
| `claims-register.md` | Everyone writing copy | Every public claim, checked against the code, with a verdict | Nothing |
| `positioning-and-icp.md` | The founder, copywriters | Who, why they switch, the lines, what is not claimed | Whether the 2Touch line is approved; whether the founder's bar may be named |
| `outreach-rules-for-counsel.md` | The owner's lawyer | The rules as read, with links, and the exact questions | Which lawyer; the legal entity |
| `pricing-and-packaging.md` | The founder | The bundles, the ladder, the price questions, a re-read of competitor prices | Costs per bar; target income |
| `onboarding-checklist.md` | The founder at the bar | Before, during and after an agent install; what "done" means | What went wrong installing at the founder's bar |
| `metrics-sheet.md` | The founder on Mondays | Seven definitions, six read-only queries, the reason list | Nothing; the owner runs the queries |
| `battlecards.md` | The founder in a conversation | One card per competitor: what they do better, what to say honestly | Any tool the founder's bar has used |
| `sales-playbook.md` | The founder | Discovery questions, visit and intro scripts, objections, follow-up. Call scripts marked "not for use until counsel clears" | The founder's own story; the weekly hours |
| `launch-and-content-plan.md` | The founder | Four weeks of posts, a launch video script shot on the demo bar | Social handles, brand assets, the domain |

---

## 10. Unverified

1. How many bars run 2Touch, anywhere or near Cincinnati. No count was found.
2. Whether 2Touch has dealers. Its site describes direct sales by its own reps. A Wisconsin tavern association listing appeared in search results and was not opened.
3. Whether a bar's 2Touch licence permits a third-party agent to read its database.
4. How the Ohio and Kentucky calling laws apply to Rail, and whether a text typed by hand to one person is treated like an autodialed one. Counsel.
5. Alcohol trade rules on referral arrangements with supplier reps. Counsel.
6. Every competitor price (the matrix lists its own doubts), and all contract and cancellation terms.
7. Clover and Toast working against a real account. How a brand-new owner gets a login (no public signup was found). A full data export. Account deletion.
8. How many bars use Rail today and whether any pays. Cost per bar. The founder's hours.
9. Whether the hosting plan in use permits commercial use. `AGENTS.md` says the Vercel Hobby plan; as I recall that plan is for non-commercial use. Check before charging.
10. Stripe account, payout access, App Review's reading of a business sale.
11. Public liquor-permit lookups exist for Ohio (apps2.com.ohio.gov, opal.ohio.gov; seen in search results only). Whether they give a usable list by county, and what may lawfully be done with it, is not checked.

## Sources read on 2026-11-25

- FTC, Complying with the Telemarketing Sales Rule: https://www.ftc.gov/business-guidance/resources/complying-telemarketing-sales-rule (first half only)
- FTC, CAN-SPAM Act compliance guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- 47 CFR 64.1200: https://www.law.cornell.edu/cfr/text/47/64.1200
- Ohio R.C. 4719.01: https://codes.ohio.gov/ohio-revised-code/section-4719.01
- Kentucky Attorney General, Information for Telemarketers: https://ag.ky.gov/Resources/Consumer-Resources/Consumers/Pages/Information-for-Telemarketers.aspx
- 2Touch: https://www.2touchpos.com
- Could not read: the FCC consumer guide on robocalls and texts (403), ecfr.gov (redirected), the Ohio Attorney General's telephone solicitor page (it lists registrants only).
- Inside the repo: the rebuild spec, `PRODUCT.md`, `AGENTS.md`, `findings/competitors/`, `findings/critique/summary.md`, `OVERNIGHT-LOG.md`, the native app architecture (section 4), `app/page.tsx`, `lib/site.ts`, `app/terms/page.tsx`.
