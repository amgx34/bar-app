# Competitor matrix (public pages, read 2026-11-25)

Ten products, one record each in this folder (`<name>.md`) with the URL behind every line. This file compares them. Method limits, stated once: public pages only, no logins or trials; several sites blocked or truncated automated reads, so some cells rest on search snippets or third-party listings and are marked. **`?` means unverified, not "no".** An absence on a public page is weak evidence that a product lacks a feature.

Legend for coverage: **Y** yes, **P** partial, **N** no (stated or not found on the pages read), **?** unverified.

## Coverage of Rail's four areas

| Product | Inventory / COGS | Payroll & tips | Sales analytics | Supplier / rep ordering |
|---|---|---|---|---|
| Toast | Y (vendor-claimed, snippets) | Y (payroll + tip pooling, vendor-claimed) | ? | P / ? (invoice automation; no ordering found) |
| MarginEdge | Y | N (reads labor cost only) | P to Y | P (invoice capture, distributor links, bill pay; ordering ?) |
| BevSpot | Y | N / ? | P (POS variance, menu profitability) | Y (orders go to vendors by email/SMS) |
| WISK | Y | N | P | P to Y (suggested ordering on higher tiers; no rep correspondence seen) |
| MarketMan | Y | N | P (depletion, AVT; no Z analytics) | Y (including EDI) |
| Bar Cop | Y | P to N ("not payroll software"; logs hours and tips; pooling ?) | P (weekly, from imported POS exports) | P (par order sheets, delivery log; rep messaging ?) |
| 7shifts | N | Y (tip pooling is a paid add-on; payroll US-only) | P (labor forecasting only) | N |
| Restaurant365 | Y (pour cost / variance ?) | P (payroll sold separately; tip pooling rules ?) | P (Z-style close ?) | P (purchasing, distributor invoices; rep messaging not described) |
| Square for Restaurants | P (finished goods; recipe tracking via a third-party add-on) | P (payroll imports direct tips; pooling not mentioned) | Y (generic) | P (vendor profiles, purchase orders) |
| Lightspeed Restaurant | P (advanced inventory is paid or higher tier; COGS not mentioned) | P / ? (tip management, scheduling) | Y | ? |

**Reading it:** nobody in the ten shows all four areas for a single bar at a small-bar price. Toast and Restaurant365 cover inventory and payroll but are a POS switch or a multi-location accounting platform. The inventory specialists (MarginEdge, BevSpot, WISK, MarketMan, Bar Cop) have no payroll or tips; the labor specialist (7shifts) has no inventory.

## Who they target, price model, onboarding

| Product | Target | Price model and numbers (USD) | Onboarding |
|---|---|---|---|
| Toast | Restaurants, bars, breweries | Per-location tiers plus processing fees. **Third-party snippets only** (site blocked): about $0 / $69 / custom, add-ons $30 to $50. Indicative at best | Hardware plus sales process |
| MarginEdge | Independent restaurants, groups, accountants; bars not named | Flat per location, $350/mo ($315 annual). Add-ons: scale +$150, Toast API pass-through 10% | Guided, a few weeks, not self-serve |
| BevSpot | Bars and restaurants, multi-location | Annual tiers: Starter $948/yr, Standard $1,428/yr. **A Pro price of "$249/yr" is below Starter and was treated as a page error.** Per-location basis ?; third parties disagree | Self-serve free trial; optional specialist chat |
| WISK | Bars, restaurants, hotels, groups | Per location per month: $249 (beverage) or $399 (food and beverage) for one venue, rising by outlet count; implementation $750+. Older snippets show $199 / $399, so which is current is ? | Demo and sales-led; no free trial; 60-day money-back |
| MarketMan | Restaurants of all sizes including bars | Starter $249, Growth $299, Enterprise "from $449" (unit and per-location basis ?); add-ons | Sales-led demo, 2 to 4 weeks |
| Bar Cop | Independent bars and restaurants | Per location, 30-day trial. **Sources conflict: $87, $124, $149, $189, $249/mo and a $299 one-time figure all appear.** Its pricing page was 404 | Self-serve, import products, first-week guide |
| 7shifts | North American restaurants including bars | Per location: Comp $0 (15 staff), Essentials $39.99, Pro $79.99, Premium $134.99 (annual); tip management add-on $49.99 | Self-serve, 14-day trial, free tier |
| Restaurant365 | Multi-location groups, franchises, accountants; a bar page exists | Quote only. One third-party figure of $435/location/mo (dated June 2024, possibly stale) | Sales-led |
| Square for Restaurants | Food and beverage including bars | Per location: Free $0, Plus $49, Premium $149; payroll $35 + $6 per person | Self-serve; hardware bought from Square |
| Lightspeed Restaurant | Restaurants, bars, breweries, hotels | Starter 69, Essential 189, Premium 399 (period assumed monthly from snippets); KDS $30 per screen | Sales-assisted, dedicated account manager |

**Price takeaways, with the doubts attached:** the specialists cluster at roughly $250 to $450 a month per location. Cheaper entry points are the labor tool (7shifts from $0 to $135) and POS-bundled plans (Square, Lightspeed, Toast), where the price is really the processing. Only BevSpot, Bar Cop, 7shifts and Square show a self-serve start; the rest are sales-led. Treat every number as indicative until Plan 5's pricing work re-reads the live pages.

## Navigation and integrations

Top-level navigation was read directly for only some sites; the rest is `?`.

| Product | Navigation shape seen | POS integrations named | Mobile |
|---|---|---|---|
| Toast | ? (blocked) | Is the POS | ? |
| MarginEdge | Solutions, How It Works, Pricing, Resources | Toast, Square, NCR Aloha, SpotOn; accounting (QuickBooks, Xero, Sage); 7shifts | iOS and Android (invoice photos; from snippets) |
| BevSpot | Product, Customer Stories, Pricing, Resources | Toast, Lightspeed, Square, Clover, Upserve, Aloha; QuickBooks | Works on any device, offline counting; native app ? |
| WISK | Features, Integrations, Pricing, Resources; For Bars / Restaurants / Hotels | Toast, Lightspeed, Clover, Square, Aloha, TouchBistro and others | iOS app, offline claimed |
| MarketMan | Solutions, Pricing, Company, Resources | Toast, Square, Lightspeed, TouchBistro; US Foods, Sysco, PFG; QuickBooks, Xero | iOS and Android |
| Bar Cop | Solutions (Inventory, Weekly Numbers, Audits, Scheduling and Shift Cash, Menu Costing, Events, Books/P&L); Details; Pricing | None: reads reports your POS exports | Web only |
| 7shifts | ? (JS shell); areas from llms.txt: hiring, scheduling, time clock, payroll and tips | 20+ POS; payroll partners ADP, Paychex, Gusto | iOS and Android |
| Restaurant365 | Accounting, Inventory and Purchasing, Workforce (incl. Tip Automation), Payroll and HR | Names **2TouchPOS** on its bar integrations page, plus Toast, Aloha, Micros, Square, SpotOn | ? |
| Square for Restaurants | Hardware, Payments, Customers, Staff (Shifts, Payroll), Banking, Developers | Is the POS | Team app; owner app ? |
| Lightspeed Restaurant | Business types, Products, Partners, Resources | Is the POS | No app described |

## Rail's five proposed destinations against what they show

Rail's hypothesis (spec phase 3): **Today, Stock, Sales, Team & Pay, Books**, with Settings and Reps in a profile menu.

| Destination | Seen in the ten |
|---|---|
| Today (dashboard) | Lightspeed "Advanced Insights", Square "Reporting"; most sites do not describe a home view at all (`?`) |
| Stock | Every inventory product has it as a primary area (MarginEdge, BevSpot, WISK, MarketMan, Bar Cop, R365 "Inventory and Purchasing") |
| Sales | Lightspeed and Square lead with it; Bar Cop has "Weekly Numbers" |
| Team & Pay | Square "Staff", R365 "Workforce Management" and "Payroll and HR", 7shifts, Bar Cop "Scheduling and Shift Cash" |
| Books | R365 "Accounting", Bar Cop "Books/P&L", MarginEdge daily P&L |
| Reps / ordering as its own area | **Not a top-level area anywhere**: it lives under Inventory and Purchasing (R365, MarketMan, BevSpot "Ordering") |

Two signals for Task 5: (1) ordering is folded into stock by the competitors that offer it, which supports moving Reps under Stock or the profile menu; (2) labor and accounting are separate areas for the big platforms (Workforce vs Accounting), which fits Rail splitting Team & Pay from Books. No competitor uses a "Today" destination by that name, so it rests on Rail's own dashboard work and PRODUCT.md, not on competitor evidence.

## What Rail has that none of the ten pages showed

(Absence on a marketing page is weak evidence; confirm before putting any of these in public copy.)

- **One product spanning inventory, payroll with tip pooling, nightly Z-report analytics and rep ordering, sized for a single bar.** The only ten that touch both inventory and payroll are Toast (a POS switch) and Restaurant365 (a multi-location platform, quote-only).
- **Tip-split rules beyond a simple pool**: individual, sales-percentage and barback modes, tiered barback cuts and an opener bonus, reconciled to the Z total. Competitors show tip pooling (7shifts, Toast, R365) but none describe these modes.
- **2Touch-native feed** via an agent on the bar PC. Only Restaurant365 names 2TouchPOS at all.
- **Pay runs as frozen snapshots with owner approval before the NACHA export**, and delivery costs recorded from the invoice instead of inferred.
- **Rep correspondence** (messages and order requests with the rep) beside inventory. WISK and Bar Cop were checked for it and showed none; others `?`.

## What most or all of the ten show that Rail lacks or did not show

Checked against Rail's navigation and PRODUCT.md only, so verify each before treating it as a gap:

- **Native mobile apps** (MarginEdge, WISK, MarketMan, 7shifts, Square). Rail is a responsive web app with a staff portal.
- **Accounting-software sync (QuickBooks, Xero)** named by MarginEdge, BevSpot, MarketMan, Restaurant365. Not found in Rail's navigation.
- **Distributor integrations and EDI** (MarginEdge, MarketMan). Rail's ordering goes to reps.
- **A published price and a self-serve free start** (BevSpot, Bar Cop, 7shifts, Square). Rail has a demo account but no public pricing yet (decided, built later).
- **A written POS-compatibility list.** Competitors name 8 to 20 POS systems; Rail's integration story is 2Touch plus Clover.

## Gaps in this research

- **Toast** was blocked (403) on every page; everything about it is from snippets and third parties.
- **Bar Cop** has conflicting prices and a 404 pricing page; **BevSpot** has a self-contradicting tier; **WISK** and **Restaurant365** have price figures of uncertain date.
- **7shifts** served only a JavaScript shell, so its navigation and headline are paraphrased from `llms.txt`.
- **Square**'s bars page was a 404 and two product pages truncated.
- No competitor's contract terms, cancellation terms or data-export policy were read; that is a dealbreaker category, not yet answered.
- Reviews on G2 and Capterra were seen only as snippets. A second pass with the owner's own accounts (or a paid review source) would close most of the `?` cells.
