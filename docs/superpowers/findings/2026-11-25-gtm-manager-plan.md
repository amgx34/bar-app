# Manager plan: go-to-market and monetization workstream (2026-11-25)

Written by the general manager agent. Read-only on code: this file and `docs/go-to-market/strategy.md` are the only things written. Branch `rebuild/foundation`. Every decision behind the queue is in the strategy file; a drafter does not reopen one.

**Roles.** Sonnet drafts and researches. Opus is not needed (nothing here has a gate to debug). The orchestrator dispatches, reviews against the acceptance list, commits and logs. The manager reviews G2, G4 and G8 before they are treated as final.

## Read this first: four findings that change the plan

1. **The front page makes claims the product cannot back today** (`app/page.tsx`): a Toast integration (`PRODUCT.md` allows only 2Touch and Clover to be claimed), "5 hrs saved per week on average", "28+ inventory items tracked", "100% automated tip calculations", "Up and running in minutes", "under an hour", "Built for every type of venue", and promises about export and deletion that no code was found to keep. G1 lists all of them. Fixing the copy is a code change and belongs to the front-page workstream with the owner's go-ahead.
2. **Ohio's telephone solicitor law does not obviously exempt a new company's business-to-business calls** (R.C. 4719.01(B)(12), read 2026-11-25 through a summarising tool). The spec assumed cold calls. They are on hold until counsel answers; see G3.
3. **Nothing can be charged yet.** No billing code, no legal entity on record, no domain (the site falls back to a `vercel.app` address and the contact is a Gmail mailbox), and `AGENTS.md` mentions the Vercel Hobby plan, which as I recall is not for commercial use (UNVERIFIED).
4. **The first ten customers do not need Stripe Billing or the packages table.** Founding bars get every module and pay by an invoice the founder sends. Both builds are deferred, which removes them from the critical path.

## Guardrails for every item (non-negotiable)

1. **Documents only.** Each item writes exactly one file under `docs/go-to-market/`. No code, no config, no migration, no other file.
2. **Nothing live.** No email, call, text, post, form submission, signup, trial or purchase. No logging in to any outside service. Public pages only.
3. **No invented facts.** No customer, testimonial, revenue, conversion rate, market size, saving or setup time. A number that is a belief is written `HYPOTHESIS` with a one-line cheap test. Something not confirmed is written `UNVERIFIED`.
4. **No real names.** No real person or bar is named as a customer or prospect. The founder's bar is "the founder's own bar" until the owner supplies the name and written permission. Competitors and 2Touch are named only as their own public pages describe them.
5. **Every product claim traces to `claims-register.md` (G1)** with a verdict of TRUE or TRUE WITH LIMIT, and carries the limit. Before G1 exists, to `AGENTS.md` or a file path.
6. **Every outside fact carries its URL and "read 2026-11-25"** (or the actual date). A page reached only through a search snippet says so. A blocked page is recorded as blocked and is not worked around.
7. **No legal conclusions.** Rules are stated "as read" and end with "confirm with counsel".
8. **Never print a secret; never read `.env*`.** Never put the owner's name, the bar's name or the project's details into a search query or an outside request.
9. **Owner-only facts are `TODO(owner)`**, never filled in: prices as final, social handles, brand assets, the domain, the postal address, lead lists, the founder's story.
10. **Plain language.** A bar owner must be able to read it. No em dashes, no emoji. Decisions and the usable material first; method and sources last.

**Acceptance, applied to every item by the orchestrator before commit:**

- `git status` shows only the one output file as new or changed.
- Search the file for `$`, `%`, "hours", "minutes", "customers", "bars use", "saves": every hit is either sourced with a URL and date, traced to the repo, or labelled `HYPOTHESIS` with a test.
- Search for "only", "first", "best", "#1", "guarantee", "automatic", "instantly", "Toast", "restaurant", "W-2", "tax": each hit is either removed or matches G1's verdict.
- No real person's or customer's name.
- The file ends with an "Unverified" list and a "Sources" list.

**Log line**, appended to `docs/superpowers/OVERNIGHT-LOG.md` under a new heading `## Go-to-market workstream (2026-11-25)`:
`- **G<n> done** (sonnet): <title>, <file>. <count> HYPOTHESIS, <count> UNVERIFIED, <count> TODO(owner). Documents only, 1 commit.`

**Stop condition for every item:** if the drafter cannot source a claim the document needs, it leaves the `UNVERIFIED` label and moves on; it does not search further than five outside reads per item (G3 and G4: ten). If an item's acceptance fails twice, the file is removed and the failure logged; the queue moves on.

---

## The work queue (in order)

### G1. Claims register

- **Model:** sonnet. **Output:** `docs/go-to-market/claims-register.md`
- **Read:** `app/page.tsx`, `lib/site.ts`, `app/_components/landing/*`, `app/thank-you/page.tsx`, `app/terms/page.tsx`, `app/privacy/page.tsx`, `app/eula/page.tsx`, `app/accessibility/`, `app/opengraph-image.tsx`, `app/manifest.ts`; then `AGENTS.md`, `PRODUCT.md`, and the code each claim points at (`lib/pos/`, `lib/payroll/`, `lib/toast/`, `lib/notifications/`, `lib/reps/`, `2touch-agent-dotnet/README.md`).
- **Must contain:** one row per public claim: the exact words, where they appear (file and line), the verdict (TRUE, TRUE WITH LIMIT, NOT BACKED, UNVERIFIED), the evidence (file path), and a suggested honest wording. Then a short "approved claims" list that later documents copy from, and a "do not say" list.
- **Must NOT claim:** that a feature works because code for it exists. Code present but never run against a real account (Toast) is UNVERIFIED, not TRUE. Does not edit any page.
- **Acceptance (extra):** covers at least the stats bar, the six feature cards, the three steps, the venue types, all eight FAQ answers, the contact bullet list and the legal-page promises on data export and deletion.
- **Stop:** when every claim on those pages has a row.

### G2. Positioning and ideal customer

- **Model:** sonnet. **Output:** `docs/go-to-market/positioning-and-icp.md`
- **Read:** `docs/go-to-market/strategy.md` sections 2 to 4, G1, `PRODUCT.md`, `findings/competitors/matrix.md`, the rebuild spec ("First customers", "Non-goals", "Anti-goals").
- **Must contain:** the ideal first customer as a checklist the founder can tick in a conversation (and the "not yet" list); the switching story as a HYPOTHESIS with the ten-conversation test; the category line and the 2Touch line; three message pillars each with its proof from G1; a one-paragraph description and a 25-word version; what Rail is not (from `/terms`); the wording rule "we have not found another tool that..." in place of "the only".
- **Must NOT claim:** "the only", "all-in-one for restaurants", any POS beyond G1's verdicts, any saving, anything about tax filing. Does not name the founder's bar.
- **Stop:** one page of usable lines plus the checklist.

### G3. Outreach rules, written for the owner's lawyer

- **Model:** sonnet. **Output:** `docs/go-to-market/outreach-rules-for-counsel.md`
- **Read:** strategy section 5 and its sources; then re-read the primary pages directly: FTC Telemarketing Sales Rule guide (the second half too), FTC CAN-SPAM guide, 47 CFR 64.1200, Ohio R.C. 4719.01 to 4719.08, Kentucky KRS 367.46951 and the Attorney General's telemarketer page. Up to ten outside reads.
- **Must contain:** for calls to a business line, calls to an owner's mobile, texts, email and walk-ins: the rule as read, the link, the date, and what stayed unclear. Then the numbered questions for counsel, starting with: (1) does Ohio R.C. 4719 require Rail to register or post a bond before calling Ohio bars; (2) is a call or hand-typed text to a bar owner's personal mobile treated as a consumer contact; (3) may Rail pay or reward a supplier rep or distributor for an introduction; (4) may the 2Touch agent read the POS database under the bar's licence; (5) what must a consent line say for a prospect who asks to be texted. Then a one-page "until counsel answers" rule sheet: what the founder may do today.
- **Must NOT claim:** that any activity is legal or illegal, that an exemption applies to Rail, or any penalty figure not quoted from a primary page with its link.
- **Stop:** when each channel has its rule, link and open question, or ten reads are spent.

### G4. Pricing and packaging

- **Model:** sonnet. **Output:** `docs/go-to-market/pricing-and-packaging.md`
- **Read:** strategy section 4, the rebuild spec ("Monetization", "Packages"), the native architecture file (Decision 5 "The subscription question", section 4), `findings/competitors/*.md`. Re-read up to ten live competitor pricing pages and record what changed since the matrix.
- **Must contain:** the two bundles and which of the spec's four modules each holds; the price ladder for the founding ten; the 30-night pilot terms in plain words; the four willingness-to-pay questions as a script and a table to record answers; the night-31 invoice step; a refreshed competitor price table with each doubt kept; a one-page quote the founder can hand over with `TODO(owner)` where the legal entity and payment details go; what triggers publishing a price, building Stripe Billing, and building the packages table; the Apple rule in two sentences.
- **Must NOT claim:** any price as final, any "from" price on a public page, a comparison that states a competitor's price without its date and doubt, a discount described as limited unless the limit is real (ten bars is real).
- **Stop:** when the quote page and the question script exist.

### G5. First-customer onboarding checklist

- **Model:** sonnet. **Output:** `docs/go-to-market/onboarding-checklist.md`
- **Read:** `2touch-agent-dotnet/README.md` (Setup, unattended install, schema mapping, diagnose, permissions, backfilling, security), `AGENTS.md` (Integrations section), `lib/pos/sync-health.ts`, `lib/pos/setup-gaps.ts`, `app/(app)/setup/`, `app/(app)/app/inventory/setup/`, `app/(app)/app/settings/`, strategy section 8.
- **Must contain:** before the visit (what to ask the bar: Windows version, who has administrator rights, the pay period, how tips are split today, the bank's ability to take a NACHA file); at the bar (install, hardening, the scheduled update task, first sync, what the green strip does and does not prove); the first week (tip rules entered, staff matched, first pay run submitted and approved); the definition of "activated" from the strategy; what to do when a feed brings nothing back; what is deliberately not set up in week one (stock); a short "what Rail does not do" sheet to leave with the owner.
- **Must NOT claim:** an install time, that updates are automatic without the scheduled task, that history is backfilled by default, or that stock will be accurate before pour sizes and recipes are set.
- **Stop:** one checklist per phase, each step tied to a README section or file.

### G6. Metrics sheet

- **Model:** sonnet. **Output:** `docs/go-to-market/metrics-sheet.md`
- **Read:** strategy section 7, `supabase/migrations/20260901000001_add_payroll_runs.sql`, `supabase/migrations/add_demo_requests.sql`, `supabase/schema-export/baseline.sql` (tables only), `lib/pos/sync-health.ts`, `lib/demo/constants.ts`, `supabase/diagnostics/` (for the house style of a read-only query).
- **Must contain:** the seven definitions exactly; for each, a read-only `SELECT` the owner pastes into the SQL editor (written as text inside the document, not as a file in `supabase/`), excluding demo bars by `DEMO_SLUG_PREFIX`; the spreadsheet columns; the fixed churn-reason list; the stop rules; what is not measured and why.
- **Must NOT claim:** a benchmark, an "industry average", or a threshold without the `HYPOTHESIS` label. No query that writes, and none that returns employee names, pay or bank details.
- **Acceptance (extra):** every query starts with `SELECT` or `WITH`, contains no `INSERT`, `UPDATE`, `DELETE`, `ALTER` or `DROP`, and names only columns that exist in the schema export.
- **Stop:** six queries and the sheet layout.

### G7. Competitor battlecards

- **Model:** sonnet. **Output:** `docs/go-to-market/battlecards.md`
- **Read:** `findings/competitors/matrix.md` and all ten records, G1, G2.
- **Must contain:** one card each for 7shifts, Toast, Bar Cop, BevSpot, WISK, MarketMan, MarginEdge, Restaurant365, Square, Lightspeed, plus "a spreadsheet and a notebook" (the real competitor): who it suits better than Rail, where Rail fits better for a single 2Touch bar, the honest answer when a prospect names it, and the doubts attached to its price. A top line on each: "recommend them when...".
- **Must NOT claim:** that a competitor lacks a feature (write "not shown on the pages read"), any price without its date and doubt, anything disparaging.
- **Stop:** eleven cards, half a page each at most.

### G8. Sales playbook

- **Model:** sonnet. **Output:** `docs/go-to-market/sales-playbook.md`
- **Read:** strategy sections 3 to 5, G1 to G5, G7.
- **Must contain:** discovery questions (starting with "show me how last night's tips were split"); the warm-introduction ask; the walk-in opener and leave-behind text; the demo path on the demo bar in five steps; the pilot offer; objections with honest answers (price, "I already have a payroll company", "does it do taxes", "what if it gets my tips wrong", "who sees my data", "what happens if you disappear", "I am not a computer person", "will it slow my POS"); the follow-up rhythm; the weekly plan. A phone script and a voicemail, each under a banner: **"Not for use until counsel has answered G3."** No text-message script for cold contact; one consent-first reply template for a prospect who asks to be texted.
- **Must NOT claim:** anything outside G1's approved list, a saving, a customer count, urgency that is not real, or that Rail replaces a payroll provider.
- **Stop:** when each script fits on one screen.

### G9. Launch and content plan

- **Model:** sonnet. **Output:** `docs/go-to-market/launch-and-content-plan.md`
- **Read:** G1, G2, the rebuild spec (phase 4a and "Established from the repo": visuals come from a demo bar, never a real one), `DESIGN.md`, `lib/demo/`.
- **Must contain:** a four-week calendar of three posts a week, each with its words, the screen to capture from the demo bar and the claim from G1 it rests on; a 60 to 90 second launch video script with a shot list on the demo bar; a launch-day checklist; where each link points and the tracking parameters to add (the site already records them); what success looks like as a HYPOTHESIS.
- **Must NOT claim:** real customers or results, real bar footage, any POS beyond G1, paid promotion. Does not create accounts or post anything.
- **Stop:** twelve posts and one script.

---

## Do NOT do now

- **Cold calls and cold texts.** Held for G3 and counsel. Rail's Twilio number is for the product, never for prospecting.
- **Publishing a price on the website.** The spec's rule stands until a payment link works and three bars have paid.
- **Building Stripe Billing, the packages table, a signup flow or analytics events.** Not needed for ten customers.
- **Annual plans, setup fees, referral fees, a free tier, lifetime discounts.**
- **Approaching 2Touch as a partner.** After three to five paying bars, and after counsel has read question 4.
- **Restaurants, groups, Toast and Square bars, other cities.**
- **Any testimonial, case study or logo** before the owner gives written permission and the numbers.
- **Buying or scraping a lead list.** The public permit lookups are noted as a possible source only.
- **Paid ads, trade-show booths, anything that costs money.**
- **Claiming payroll tax withholding or filing.** The spec forbids it until the tables are checked.
- **Editing the landing page from this workstream.** G1 produces the list; the change is a separate, owner-approved code task.

## Handed to other workstreams (code, needs the owner's go-ahead)

In the order the strategy ranks them (section 8): Payroll Review approval rules; confirm and deploy the role fix A1 and check row security on live; the two real-data tips queries; the front-page copy corrections from G1; the Books "no cost data" rule; silence-as-zero on Sales and Inventory; gating `/api/poll-2touch` and requiring `CRON_SECRET`; payroll day phone layout; account closure and export, or softer wording.

## Owner-only steps

1. Read `docs/go-to-market/strategy.md` section 1 and say yes, no or change to each of the eight rows.
2. Decide the legal entity. It is needed for Stripe, for Apple (the native plan already asks) and for the postal address CAN-SPAM requires.
3. Engage counsel and hand over G3. No calling before the answers.
4. Register a domain and a mailbox on it; set `NEXT_PUBLIC_SITE_URL`. Until then nothing printed or emailed goes out.
5. Check the hosting plan allows commercial use before charging anyone.
6. Open a Stripe account in the entity's name. Invoices and payment links only, for now.
7. Do the items already on the morning list that gate selling: the two tips queries, the A1 check on live, the Payroll Review rules, key rotation.
8. Write down, for the founder's own bar: how tips were done before Rail, how long it took, what changed. Real numbers only, and say in writing which may be used.
9. Have ten conversations with 2Touch owners already known personally, in person. Ask the discovery and price questions from G8 and G4. Record answers in the G6 sheet.

## Inputs the owner must supply

| Input | Used by | Default until supplied |
|---|---|---|
| Bars using Rail today, and whether any pays | Strategy, G2, G6 | Assume none pays and only the founder's bar is a reference |
| Whether the founder's bar may be named, and its numbers | G2, G8, G9 | Unnamed: "the founder's own bar" |
| Cost per bar per month (hosting, database, AI parsing, texts, email) | G4 | Unknown; price stays a hypothesis |
| Hours per week for selling and for installs | G8 | Ten |
| Legal entity, state, postal address | G3, G4, G8 | None; nothing is invoiced or emailed |
| Domain, mailbox, phone number | G8, G9 | None; `TODO(owner)` |
| Social handles and brand assets | G9 | `TODO(owner)` |
| The founder's story: why Rail was built | G2, G8, G9 | Left blank |
| How many 2Touch bars the founder knows personally | Strategy section 5 | Unknown; if fewer than five, email moves up |
| What went wrong installing the agent at the founder's bar | G5 | README only |
| Any tool the founder's bar used before | G7 | None |
| Target monthly income from Rail in a year | G4 | Not assumed |

## Open questions, with the default taken

| # | Question | Default taken |
|---|---|---|
| 1 | Is the sharper 2Touch line approved? `PRODUCT.md` reserves stronger claims for the owner. | Used in conversation only; the site keeps "one app for the whole bar". |
| 2 | Two bundles, or packages designed per bar as the owner said? | Two bundles for selling; the four-module mechanism from the spec is kept for later. |
| 3 | Are $99, $149 and $199 acceptable as the founding ladder? | Yes, as hypotheses, tested by the night-31 invoice. |
| 4 | May a price go on the website? | No, per the spec, until a payment link works and three bars have paid. |
| 5 | Is Toast to be claimed? | No. Removed from all go-to-market documents until run against a real account. |
| 6 | Are cold calls part of the plan? | On hold until counsel. Warm introductions and walk-ins first. |
| 7 | Are Clover bars prospects? | Accepted if they ask and are nearby; not sought. |
| 8 | Restaurants in the copy? The spec allows it "where the product backs it". | Bars only in every document. |
| 9 | Is a setup fee wanted? | Not for the first ten. |
| 10 | Is the 30-night pilot free with no card? | Yes; it starts at the first synced Z report. |
| 11 | May supplier reps be asked for introductions? | Yes, unpaid; question 3 in G3 goes to counsel before anything is offered in return. |
| 12 | Is the founder's bar the public case study? | Planned, unnamed, until written permission and numbers arrive. |
| 13 | Who is the reference when a prospect asks "who else uses it"? | The honest answer: the founder's own bar, and you would be among the first ten. |
