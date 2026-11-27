# Competitor battlecards

Date: 2026-11-25. For the founder, to use in a conversation with a bar owner. Branch `rebuild/foundation`. Nothing here has been sent or published.

**How to use it.** When an owner names a tool, find its card. Each card says when to recommend them instead of Rail. That is on purpose: an owner who hears "they may suit you better" believes the rest.

**The rules this file keeps**
- Every competitor statement cites `file:line` in `docs/superpowers/findings/competitors/` (short form below: `toast.md:8` means that folder's `toast.md`, line 8). Matrix lines cite `matrix.md`.
- "We have not verified this" means the public pages read did not settle it. It does not mean "they do not do it". An absence on a marketing page is weak evidence (matrix.md:3).
- No competitor price is stated as fact. Each is "reported", with its date (read 2026-11-25) and its doubt. Competitors change prices; re-read the live page before any quote.
- We never say Rail is "the only" tool. The wording is "we have not found another tool that does all four of these for a single bar", which rests on public pages, several blocked (strategy.md section 4).
- The claims register (`docs/go-to-market/claims-register.md`) did not exist when this was written. Every Rail claim below is traced to `AGENTS.md`, `PRODUCT.md`, `strategy.md` section 2 or a code path. When the register lands, check each Rail line against it.
- No customer, testimonial, win rate, saving or setup time appears. None exists on record (PRODUCT.md "Evidence on Hand").

## What Rail does and does not do (the Rail side of every card)

True today, with the source:
- A Windows agent on the bar's 2Touch computer sends Z reports, employee-week data and the item audit every five minutes; an emailed nightly report is the fallback (AGENTS.md, "Integrations"; PRODUCT.md "Operating Context").
- Tip splits with pooled, individual and percentage-of-sales modes, a barback cut and an opener bonus (strategy.md section 2; `lib/payroll/tip-pool.ts:13-14,35`). **Limit:** `tip-pool.ts:15` says the pool engine itself pays only pool-mode staff; individual and percentage-of-sales staff are handled by `lib/payroll/night-split.ts` (added 2026-11-25). Individual mode was checked end to end on the demo bar (the pay run and the day split both reconcile to the cent); percentage-of-sales mode is covered by unit tests only, not checked on real data. A hand-entered cash tip count is never overwritten by the POS (AGENTS.md, "Cash tips entered by a person outrank the POS"). The claim that a night's tips reconcile to the Z report is not to be made until the two real-data checks are done (strategy.md section 2, "True with a limit").
- A pay run is frozen when submitted, an owner approves it, and the bank file (NACHA) is locked until approval unless an owner overrides with a written reason (AGENTS.md, "A pay run is a snapshot"; `app/api/payroll/nacha/route.ts:78`; `app/(app)/app/payroll/approval-actions.ts:441`). Rail never holds or moves funds; the bar's own bank does (strategy.md section 2).
- A delivery's cost is the invoice's, not an estimate (AGENTS.md, "A delivery's cost is recorded, not inferred").
- POS sales reduce stock, but only once each item has a container size and a pour size or recipe (AGENTS.md, "POS sales deplete stock"; strategy.md section 2, "True with a limit").
- Orders to supplier reps by email or text, with a history (`lib/reps/email.ts`, `lib/reps/sms.ts`; strategy.md section 2).
- Alerts for low stock, nightly sales, sales anomalies and pay runs waiting for approval (AGENTS.md, "Notifications are two streams").
- A demo bar anyone can open from the website, no signup (PRODUCT.md "Evidence on Hand").

Not true, never to be claimed (strategy.md section 2, "Not real, or not proven"): Toast support (code exists, never run against a real account); any POS other than 2Touch and Clover (PRODUCT.md); payroll tax filing or withholding; a native phone app; QuickBooks or Xero sync (a search of `app/`, `lib/` and `components/` found none); multi-location reporting (one organisation is one bar, AGENTS.md); self-serve signup; online billing; any published price. Rail has no customers on record and the founder's own bar is the only reference.

---

## Comparison table the founder can show

Only facts read on a competitor's own page or a vendor page, with no third-party doubt. Blank means "not shown on the pages read", not "no". Rail's column is true today.

| | Rail | MarginEdge | BevSpot | WISK | MarketMan | 7shifts | Square for Restaurants |
|---|---|---|---|---|---|---|---|
| Inventory and costing | Yes, needs pour sizes set up | Yes (marginedge.md:9) | Yes, Standard tier and up (bevspot.md:60) | Yes (wisk.md:80) | Yes (marketman.md:99) | Not shown (7shifts.md:14) | Partial, finished goods only (square-restaurants.md:14) |
| Payroll | Rail calculates; the bank moves the money; no tax filing | Not shown; labor cost reports only (marginedge.md:35) | Not shown (bevspot.md:61) | Not shown (wisk.md:81) | Not shown (marketman.md:100) | Yes, US only (7shifts.md:15) | Yes, with tax filings (square-restaurants.md:15) |
| Tip pooling | Yes, several modes | Not shown | Not shown | Not shown | Not shown | Yes, paid add-on (7shifts.md:8) | Not mentioned on the page read (square-restaurants.md:15) |
| Nightly Z-report analytics | Yes, from the 2Touch feed | Via POS sync (marginedge.md:36) | Partial (bevspot.md:62) | Partial (wisk.md:82) | Partial (marketman.md:102) | Labor forecasting only (7shifts.md:16) | Yes, generic (square-restaurants.md:16) |
| Orders to suppliers | Reps, by email or text | Invoice capture; ordering not verified (marginedge.md:37) | Yes (bevspot.md:63) | Partial to yes (wisk.md:83) | Yes, incl. EDI (marketman.md:103) | Not shown (7shifts.md:17) | Partial (square-restaurants.md:17) |
| Reads a 2Touch POS | Yes (agent) | Not named (marginedge.md:31) | Not named (bevspot.md:57) | Not named (wisk.md:77) | Not named (marketman.md:97) | Not named (7shifts.md:11) | It is the POS |
| Phone app | Responsive website and staff portal, no native app | iOS and Android (marginedge.md:32) | Any device; native app not verified (bevspot.md:58) | iOS app (wisk.md:78) | iOS and Android (marketman.md:98) | iOS and Android (7shifts.md:12) | Team app (square-restaurants.md:12) |
| Accounting sync (QuickBooks, Xero) | None | Yes (marginedge.md:31) | QuickBooks (bevspot.md:57) | QuickBooks Online (wisk.md:77) | Yes (marketman.md:97) | Payroll partners (7shifts.md:11) | QuickBooks Online for payroll (square-restaurants.md:11) |
| Free start without a sales call | Demo bar only; pilot is arranged by the founder | No, guided (marginedge.md:30) | Free trial (bevspot.md:56) | No trial (wisk.md:76) | No, demo needed (marketman.md:96) | 14-day trial (7shifts.md:8) | Self-serve (square-restaurants.md:10) |

Left out on purpose: every price (see each card), Toast (its pages were blocked, toast.md:3), Bar Cop, Restaurant365 and Lightspeed (their key cells rest on snippets or are unverified).

*Footer: facts from public pages read on 2026-11-25. Competitors change their pages and prices without notice; this table is a snapshot, not a quote. Read the live page before relying on it. Rail's column describes the product as of the same date.*

---

## Card 1: Toast

**Recommend them when** the owner is already thinking of replacing the POS itself and wants payments, hardware, payroll and inventory from one company.

- **Trigger.** "We're looking at Toast." "My rep says Toast does payroll and tips too."
- **Read this first.** Toast's own pages were blocked (HTTP 403) on every read (toast.md:3, toast.md:20). Everything below is from search snippets and third-party articles. Do not quote any of it as Toast's own position.
- **What they are good at (vendor-claimed, snippets).** The bar page claims POS ordering and payments, inventory with invoice automation and recipe costing, and payroll with tip pooling and scheduling (toast.md:9, toast.md:14, toast.md:15). A reviewer lists it as a good fit for bars that serve food (toast.md:5).
- **Where a single 2Touch bar might still prefer Rail.** Toast replaces the POS, so a bar must switch (toast.md:18). A 2Touch owner who owns the system and does not want to change it can keep it and add Rail on top (strategy.md section 3, option A, citing 2touchpos.com). Hardware is reported as bought separately (toast.md:18).
- **Where Rail does not win, say so.** If the owner wants card processing, handhelds, online ordering or a delivery integration, Rail is not a POS and offers none. Toast is the POS; we have not verified how deep its sales reports go (toast.md:16). Rail does not run on Toast: the code exists but was never run on a real account, so we do not claim it (strategy.md section 2).
- **Three honest questions.** (1) Are you happy with your POS, or is it the thing you want to change? (2) Does your bar serve enough food that you need food costing and online ordering? (3) Who works out your tips and pay today, and how long does that take you?
- **Objections and honest answers.**
  - "Toast does it all." It may; we could not read its pages, so we have not verified what is included or at what cost. Ask the Toast rep for the payroll and inventory price in writing and compare.
  - "Toast reps say you need it for payroll." Rail does not replace a POS. If you are leaving your POS anyway, Toast is a sensible choice to price.
  - "Is Rail on Toast?" No. Not today.
- **Evidence and caveat.** `toast.md:3-18`. Prices reported by third parties only, such as a $0 or $69 monthly software tier plus card fees and a $9-per-employee payroll promo (toast.md:8). These are unverified against Toast's own page; indicative at best (matrix.md "Who they target"). Not in the comparison table for that reason.

## Card 2: MarginEdge

**Recommend them when** the owner mainly wants invoices turned into costs and a daily food and drink P&L, and is happy with a guided, paid onboarding.

- **Trigger.** "My accountant uses MarginEdge." "I want my invoices scanned."
- **What they are good at.** Invoice automation (AI plus human reviewers), daily P&L and price-change alerts, recipe costing, bill pay; accounting integrations with QuickBooks, Xero and Sage; distributor links; free iOS and Android apps with invoice photo capture (marginedge.md:29, marginedge.md:31, marginedge.md:32). It cites 12,000+ restaurants (marginedge.md:3). Onboarding is hands-on, guided by former operators (marginedge.md:30).
- **Where a single 2Touch bar might prefer Rail.** The page lists POS integrations (Toast, Square, NCR Aloha, SpotOn) and does not name 2Touch (marginedge.md:31); we have not verified whether it can read a 2Touch POS. It reads labor cost from scheduling tools and shows no payroll or tip pooling (marginedge.md:35). A bar that wants the tip split and pay run closed in the same place as sales would need a second tool beside it.
- **Where Rail does not win.** Accounting sync, invoice scanning by photo, distributor integrations and a native phone app. Rail has none of these (matrix.md "What most or all of the ten show that Rail lacks"). If the bar's accountant lives in QuickBooks and wants coded invoices, MarginEdge is the closer fit.
- **Three honest questions.** (1) Does your accountant want bills in QuickBooks or Xero? (2) Is your worst job after close the invoices, or the tips and pay? (3) Is your POS one MarginEdge names?
- **Objections and honest answers.**
  - "Their price is a lot." Reported at a flat monthly rate per location with an annual option (marginedge.md:28). Do not quote it; read their page.
  - "They have an app." True; Rail's phone use is the website, plus a staff portal.
  - "Can I use both?" Probably. We have not tested the two together.
- **Evidence and caveat.** `marginedge.md:3-38`. Pricing came from their own pricing page (marginedge.md:28) but may have changed; it also lists extra fees such as a Toast API pass-through and unstated onboarding fees (marginedge.md:38). "Bars not named" as a target (marginedge.md:3).

## Card 3: BevSpot

**Recommend them when** the owner wants counting, ordering and variance for a bar, wants to start free on their own, and does not need payroll in the same tool.

- **Trigger.** "I use BevSpot." "A rep told me about BevSpot."
- **What they are good at.** Faster counting with offline mode, one-click ordering to vendors by email or SMS, recipe costing, and a self-serve free trial (bevspot.md:55, bevspot.md:56, bevspot.md:63). Built for bars and restaurants and names Clover, Square, Toast, Lightspeed and several others (bevspot.md:45, bevspot.md:57).
- **Where a single 2Touch bar might prefer Rail.** 2Touch is not in the POS list read (bevspot.md:57); we have not verified how a 2Touch bar would feed it. Payroll and tip pooling were not shown (bevspot.md:61). Z-report-style analytics were not named (bevspot.md:62).
- **Where Rail does not win.** Their counting and ordering pages show more depth than ours, they list far more POS systems, and they let a bar start without talking to anyone (bevspot.md:56). Rail has no public trial. If the owner mostly needs a good count-and-order tool, try BevSpot first.
- **Three honest questions.** (1) What takes the longest after close: counting, or sorting out tips and pay? (2) Do you order from reps by phone, text or an app? (3) Do you want to be able to try a tool tonight on your own?
- **Objections and honest answers.**
  - "They have a free trial, you don't." True. What we offer is a demo bar and a pilot on your own data, set up by the founder.
  - "Is it cheaper?" We have not verified; their pricing page shows an inconsistent tier and third parties disagree widely (bevspot.md:51, bevspot.md:53).
- **Evidence and caveat.** `bevspot.md:45-64`. Price: the page shows annual tiers, but one tier looks like a page error and per-location basis is unverified (bevspot.md:48-53). Do not quote a figure.

## Card 4: WISK

**Recommend them when** the owner wants a specialist beverage and food inventory tool with scale hardware and strong variance reporting, and accepts a demo-led start and a one-time setup fee.

- **Trigger.** "WISK has a scale." "My bar group uses WISK."
- **What they are good at.** Inventory counting with split counts among users and a Bluetooth scale, AI invoice processing, variance and COGS dashboards, recipe costing; a 60-day money-back guarantee; an iOS app (wisk.md:75, wisk.md:76, wisk.md:78). Names Toast, Lightspeed, Clover, Square, TouchBistro and more as POS integrations (wisk.md:77).
- **Where a single 2Touch bar might prefer Rail.** 2Touch was not among the POS systems named (wisk.md:77). Payroll and tips are not mentioned (wisk.md:81). No rep correspondence was seen (wisk.md:83).
- **Where Rail does not win.** Hardware-assisted counting (the scale) and a phone app; Rail has neither. Rail does not show multi-venue reporting (one organisation is one bar).
- **Three honest questions.** (1) Do you want a scale at the bar, or counts by eye and phone? (2) Do you own more than one venue? (3) Is a one-time setup fee fine, or would you rather start without one?
- **Objections and honest answers.**
  - "WISK counts with a scale." True. Rail does not.
  - "WISK has a money-back promise." Yes (wisk.md:84). Rail's equivalent is a 30-night pilot on your own data, which is a founder proposal and not yet written into any contract.
- **Evidence and caveat.** `wisk.md:3-84`. Pricing page figures are reported per location per month with a one-time implementation fee (wisk.md:74); older snippets show different numbers and we do not know which is current (wisk.md:74, matrix.md). A Black Friday promotion is shown (wisk.md:74) and may have ended. Do not quote.

## Card 5: MarketMan

**Recommend them when** the owner wants purchasing, invoice scanning and distributor ordering (including EDI with US Foods, Sysco, PFG) as the main job.

- **Trigger.** "My distributor connects to MarketMan."
- **What they are good at.** Inventory, recipe costing, actual-versus-theoretical reports, smart ordering and invoice scanning; EDI with distributors; iOS and Android apps (marketman.md:95, marketman.md:97, marketman.md:98).
- **Where a single 2Touch bar might prefer Rail.** 2Touch was not named among POS systems (marketman.md:97). Payroll and tips were not mentioned (marketman.md:100). Bars are one segment of many, not the focus (marketman.md:91).
- **Where Rail does not win.** Distributor integrations and EDI, accounting sync, native apps. Rail's ordering goes to reps and has no distributor feed (matrix.md "What most or all of the ten show that Rail lacks").
- **Three honest questions.** (1) Do you order mostly from a distributor's portal or from reps who visit? (2) Do your distributors support electronic orders? (3) Who does the pay run?
- **Objections and honest answers.**
  - "They have EDI." Yes (marketman.md:103). We do not.
  - "A demo is required." That is what their page describes (marketman.md:96); we have not tried their sales process.
- **Evidence and caveat.** `marketman.md:3-104`. Reported monthly tiers with add-ons and a promo of unstated terms; whether the price is per location or per account is unverified (marketman.md:94). Contract length and setup fees are not stated (marketman.md:104). Do not quote.

## Card 6: Bar Cop

**Recommend them when** the owner wants a long-standing back-office tool for an independent bar, accepts importing POS exports, and wants to try it free first.

- **Trigger.** "I've heard of Bar Cop."
- **What they are good at.** Founded 2004 for independent bars and restaurants (bar-cop.md:3). Weekly numbers (pour and food cost, variance, labor percentage, prime cost), audits, scheduling and shift cash, menu costing (bar-cop.md:9). A 30-day free trial and a live demo with no signup (bar-cop.md:8). It reads reports your POS exports, so it is not tied to one POS (bar-cop.md:11).
- **Where a single 2Touch bar might prefer Rail.** Bar Cop has no live POS feed; it reads exported reports (bar-cop.md:11, bar-cop.md:16). Rail's 2Touch agent pushes the night in without someone exporting a file. It states it is not payroll software and we have not verified its tip pooling (bar-cop.md:15).
- **Where Rail does not win.** A trial anyone can start (bar-cop.md:8), a long track record, and a published demo; Rail has a demo bar only. If exporting a report each week is no trouble, Bar Cop may be enough.
- **Three honest questions.** (1) Does someone already export a sales report each week? (2) Do you want pay and tips in the same tool, or only the numbers? (3) Would you rather try something free tonight?
- **Objections and honest answers.**
  - "Bar Cop is cheaper." We have not verified. Sources conflict from $87 to $249 a month plus a one-time $299 figure, and its pricing page returned 404 (bar-cop.md:8).
  - "It does scheduling." Yes (bar-cop.md:9). Rail does not schedule shifts.
- **Evidence and caveat.** `bar-cop.md:3-18`. Price is unresolved; do not quote.

## Card 7: 7shifts

**Recommend them when** the owner's problem is scheduling, time clock and team communication, or wants payroll and tip pooling from a labor specialist with a free tier.

- **Trigger.** "We schedule on 7shifts." "7shifts does tips."
- **What they are good at.** Scheduling with POS-sales labor forecasting, time clock, payroll (US only), tip management (equal, percentage and points splits), hiring and team tools, a free iOS and Android app, a 14-day trial, and a stated no-long-term-contract policy (7shifts.md:7, 7shifts.md:9, 7shifts.md:12, 7shifts.md:8, 7shifts.md:18). 20+ direct POS integrations (7shifts.md:11).
- **Where a single 2Touch bar might prefer Rail.** 7shifts shows no inventory, no supplier ordering and no Z-report analytics product (7shifts.md:14, 7shifts.md:16, 7shifts.md:17). 2Touch was not among the POS named (7shifts.md:11). Rail ties the tip split to the night's sales feed and to stock in one place. We have not verified how 7shifts treats cash tips or the 2Touch feed.
- **Where Rail does not win.** Scheduling, shift swaps, the time clock, tax-filed payroll and a native app. Rail does not file payroll taxes (strategy.md section 2) and does not schedule. If the owner wants staff to swap shifts on a phone, use 7shifts. Many bars could use both; we have not tested that.
- **Three honest questions.** (1) Do you schedule on paper, a group chat or software? (2) Do you want payroll taxes filed for you? (3) Where does the tip count get done: the register, the safe, a notebook?
- **Objections and honest answers.**
  - "7shifts already splits tips." It does, as a paid add-on (7shifts.md:8, 7shifts.md:15). We have not verified how it handles cash tip counts or barback and opener rules.
  - "Does Rail replace my payroll company?" No. Rail does not file payroll tax; it calculates pay and writes a bank file the bar's own bank uses (strategy.md section 2).
- **Evidence and caveat.** `7shifts.md:3-18`. The site and pricing page served only an empty shell, so facts come from its llms.txt and a comparison page (7shifts.md:3). Reported tiers run from free to about a hundred and thirty-five a month per location plus add-ons (7shifts.md:8); the payroll per-employee fee is unverified and sources disagree (7shifts.md:8). Do not quote.

## Card 8: Restaurant365

**Recommend them when** the owner has several locations, or a restaurant with an in-house accountant, and wants accounting, inventory, workforce and payroll in one platform.

- **Trigger.** "My accountant says Restaurant365." "R365 has a bar page."
- **What they are good at.** Accounting, inventory and purchasing, workforce management with Tip Automation, and payroll and HR, with AI dashboards (restaurant365.md:6). Its bar page promises bar inventory, accounting and workforce in one platform (restaurant365.md:5). It is the only one of the ten whose page names 2TouchPOS among its integrations (restaurant365.md:10); we have not verified how deep that integration is.
- **Where a single 2Touch bar might prefer Rail.** R365 is aimed at multi-location groups, franchises and accounting firms (restaurant365.md:4). It is sales-led with quote-only pricing and a reported implementation fee (restaurant365.md:7, restaurant365.md:9). One reviewer suggests it may be too heavy for a very small venue (restaurant365.md:17). Payroll is bought and implemented separately (restaurant365.md:17).
- **Where Rail does not win.** Full accounting and bank reconciliation, multi-location control, and the scale of their customer base (restaurant365.md:6). If the bar is a group, or if an accountant runs the books in R365, Rail does not compete.
- **Three honest questions.** (1) How many locations do you have, and are more planned? (2) Who keeps your books, and in what software? (3) Are you ready for a sales-led setup that takes time?
- **Objections and honest answers.**
  - "R365 reads 2Touch." Their bar page lists 2TouchPOS among logos (restaurant365.md:10). We have not verified what it reads.
  - "R365 is a real accounting system." Yes. Rail is not one and does not file taxes.
- **Evidence and caveat.** `restaurant365.md:3-17`. No price is published. A third-party 2024 figure of about $435 per location per month may be stale; a snippet shows a different range, unverified (restaurant365.md:7). Do not quote.

## Card 9: Square for Restaurants

**Recommend them when** the owner is changing POS anyway, or already uses Square, and wants payments, payroll and basic inventory with no contract and a free start.

- **Trigger.** "I'm already on Square." "Square has payroll."
- **What they are good at.** Self-serve sign-up, bars and breweries named as a target, scheduling and payroll with tax filings and W-2/1099, a published tier list, and a stated no-lock-in policy (square-restaurants.md:5, square-restaurants.md:10, square-restaurants.md:15, square-restaurants.md:18).
- **Where a single 2Touch bar might prefer Rail.** Square is a POS, so using it means switching (square-restaurants.md:7). Its inventory is finished-goods only, with recipe tracking via a third-party add-on (square-restaurants.md:14). The payroll page read did not mention tip pooling, so we have not verified it (square-restaurants.md:15). No rep-messaging workflow was seen (square-restaurants.md:17).
- **Where Rail does not win.** If the owner wants one vendor for payments, hardware and payroll with tax filing, Square wins. Rail does not file taxes.
- **Three honest questions.** (1) Are you happy with your current POS and processor? (2) Do you need payroll taxes filed for you? (3) Is your inventory mostly bottles, or finished items?
- **Objections and honest answers.**
  - "Square is free to start." The base plan is reported free; add-ons and payroll are priced separately (square-restaurants.md:8). Check their page.
  - "Square does tip pooling." Not mentioned on the payroll page we read (square-restaurants.md:15); we have not verified.
- **Evidence and caveat.** `square-restaurants.md:3-20`. The bars page returned 404 and some product pages were truncated, so some items are unverified (square-restaurants.md:20). Prices are from Square's own pages (square-restaurants.md:8) but regions differ and fees change; do not quote.

## Card 10: Lightspeed Restaurant

**Recommend them when** the owner is choosing a POS and wants a speed-focused system with account management, multi-location tools and reporting.

- **Trigger.** "Lightspeed quoted me."
- **What they are good at.** A POS with assisted switching, data migration, one-on-one onboarding and a dedicated account manager, and an Advanced Insights reporting product (lightspeed.md:9, lightspeed.md:6). Names bars and breweries as targets (lightspeed.md:5).
- **Where a single 2Touch bar might prefer Rail.** Lightspeed is a POS, so using it means switching. Inventory is partial, with advanced inventory a paid add-on or higher tier (lightspeed.md:14). Payroll and tip pooling were not stated, only tip management (lightspeed.md:15). Supplier ordering was not verified (lightspeed.md:16).
- **Where Rail does not win.** A full POS with hardware, payments and reservations integrations (lightspeed.md:8, lightspeed.md:11).
- **Three honest questions.** (1) Are you replacing the POS, or keeping it? (2) Is the quote you have all-in with payments and hardware? (3) Who works out tips and pay after close?
- **Objections and honest answers.**
  - "They said no hidden fees." Their page says flat-rate pricing with no hidden fees (lightspeed.md:18); contract length and processor fees were not listed, so we have not verified them.
- **Evidence and caveat.** `lightspeed.md:3-18`. The page lists three tiers and a custom tier but the billing period is not stated (lightspeed.md:8); third-party snippets say monthly, and regions differ. Do not quote.

## Card 11: "A spreadsheet and a notebook" (doing nothing, and the POS reports)

This is the real competitor. No product page backs this card: it rests on the bar's own routine, so every line here is a question to ask, not a fact (strategy.md section 3, "Why they switch", is a HYPOTHESIS).

**Recommend it when** the night is quick to close, the owner trusts the numbers, and tips and pay are straightforward. A free tool that works is a good tool.

- **Trigger.** "I do it on paper." "The POS already has reports." "It works fine."
- **What it is good at.** It costs nothing, the owner understands every figure, nobody has to learn software, and nothing breaks when the internet does.
- **Where a single 2Touch bar might prefer Rail.** When the tip split is done late and by hand, when staff question it, when pay is worked out from memory or a notebook, or when the Z report is read but never connected to stock or pay. This is a hypothesis to test in conversation, not a finding (strategy.md section 3). The only way to learn it is to ask: "Show me how last night's tips were split."
- **Where Rail does not win.** A small bar with two or three staff, a tidy sheet and no disputes. Also a bar that will not install a program on its POS computer, since Rail needs one (AGENTS.md, "Integrations"). Also an owner who wants payroll taxes filed or accounting sync, which Rail does not do.
- **Three honest questions.** (1) Show me how last night's tips were split. (2) When did a number last turn out to be wrong, and who found it? (3) What would you stop doing if the close ran by itself?
- **Objections and honest answers.**
  - "The POS already reports." It does, and Rail starts from the same data. What Rail adds is the tip split, the pay run with approval, stock depletion and rep orders on top of it, once set up.
  - "I don't have time to set up software." Honest answer: setup is real work. The agent must be installed on the POS computer, and stock needs pour sizes and recipes before it is accurate (strategy.md section 2). We do not promise a setup time. The pilot starts with the nightly close only.
  - "What if I just keep my sheet?" That is a fine answer if the sheet works.
- **Evidence and caveat.** No competitor file. Rail side: AGENTS.md "Integrations", strategy.md sections 2 and 3. No time saved or error rate is claimed because none has been measured.

---

## What to do with the answers

Write each owner's answers to the three questions after the conversation. If an owner mentions a competitor not in this file, add a card from its public pages only, in the same shape, and keep its price out unless you have read the live page that day.

## Unverified

- Toast: all of it, because its pages were blocked (toast.md:3).
- Whether any named competitor can read a 2Touch POS: only Restaurant365 names 2TouchPOS, and how deep that goes is unverified (restaurant365.md:10).
- Every competitor price and contract term (see each card). Third-party prices for BevSpot, Bar Cop, Toast and Restaurant365 conflict or may be stale.
- Whether 7shifts, MarginEdge, Square and Lightspeed handle cash tips or barback and opener rules like Rail does.
- Contract, cancellation and data-export terms for all competitors: not read (matrix.md "Gaps in this research").
- Rail: percentage-of-sales tip mode on real data (unit-tested only; individual mode was checked on the demo bar on 2026-11-25 via `lib/payroll/night-split.ts`), and reconciliation of tips to the Z report on real data. Both stay out of anything said to an owner until confirmed.
- The claims register was not present when this file was written.

## Sources

Competitor records, all read 2026-11-25, in `docs/superpowers/findings/competitors/`: `toast.md`, `marginedge.md`, `bevspot.md`, `wisk.md`, `marketman.md`, `bar-cop.md`, `7shifts.md`, `restaurant365.md`, `square-restaurants.md`, `lightspeed.md`, and the comparison `matrix.md`. Each of those files holds the original URLs and its own caveats.

Rail side: `AGENTS.md`, `PRODUCT.md`, `docs/go-to-market/strategy.md` (sections 2 to 4), `lib/payroll/tip-pool.ts`, `app/api/payroll/nacha/route.ts`, `app/(app)/app/payroll/approval-actions.ts`, `lib/reps/email.ts`, `lib/reps/sms.ts`.
