# Navigation validation: the five destinations (2026-11-25)

Plan 2 Task 5 and the document half of N6. Nothing in the app changed: the navigation is exactly as before and `lib/nav/destinations.ts` is imported by no component. Sources: `route-inventory.md`, `2026-11-25-screen-pruning.md`, `competitors/matrix.md`, `lib/permissions.tsx`, and `app-sidebar.tsx`, `bottom-nav.tsx`, `section-tabs.tsx`, `nav-config.ts`.

**Click counts below are derived from reading the code, not measured in a browser.** A "click" is one tap or click on a navigation control or tab. Scrolling a tab strip is not counted. Every task starts on the Today screen (`/app/dashboard`, the PWA start page) and ends on the screen that holds the answer.

## OWNER TO CONFIRM

| # | Question | Recommendation |
|---|---|---|
| 1 | The destination table in section 1: Today, Stock, Sales, Team & Pay, Books, profile menu, staff portal. | Approve as the working hypothesis. |
| 2 | **Reps under Stock as an "Ordering" tab.** A change from the spec, which put Reps in the profile menu. | Approve. Ordering is a weekly job that PRODUCT.md names; the competitors that offer it fold it into inventory or purchasing, none make it top level, and none put it behind a profile menu. |
| 3 | Tips and Tax as tabs of Team & Pay, so Team & Pay and Stock each hold six tabs. | Approve, and watch it: six is at the edge of Miller's limit. |
| 4 | **Two of the ten tasks, and two rarer ones, get one click longer on desktop** (order from a rep, the Tips page, Settings, Tax; section 2). | Accept, or ask for the Today shortcuts in section 2. These are a cost of the proposal, not a rounding error. |
| 5 | Destination items in the sidebar must **navigate on the first click**. Today a section with tabs (Inventory, Payroll) only expands on its first click. The savings in section 2 depend on this. | Required for the rebuild. |
| 6 | Whether an accountant should see Stock (every action there is owner or manager only; the role can read). | Keep it visible. |

**Unlock for the visible rebuild (Plan 2 Task 7 steps 3-4).** (a) The owner confirms the table above. (b) The change is verified in a browser, watched, at 1280 and 390 wide, **as owner and as accountant** (a manager is the third role and worth one pass), with: every URL in `route-inventory.md` loading; no destination empty; the active destination marked on every child route, including `/app/reps`, `/app/tips`, `/app/tax` and the six redirect stubs; keyboard focus order; one `<main>`; 44px mobile targets; the console clean; and the click counts in section 2 re-measured and compared. Also required: the staff portal `/me` visibly untouched. The walk could not sign in as staff, so that check needs a staff account.

## 1. Every page mapped to one destination

All 37 pages in `route-inventory.md`. `/app/dashboard` is in the inventory; there are no dynamic `[param]` page routes. URLs are not renamed and no redirect is added.

| Path | Destination | Note |
|---|---|---|
| `/app/dashboard` | **Today** | |
| `/app/inventory` | **Stock** | Items tab |
| `/app/inventory/weigh` | **Stock** | |
| `/app/inventory/shipments` | **Stock** | |
| `/app/inventory/setup` | **Stock** | |
| `/app/inventory/analytics` | **Stock** | Contested, see below |
| `/app/reps` | **Stock** | Ordering tab. Contested, see below |
| `/app/analytics` | **Stock** | Redirect stub to `/app/inventory/analytics` |
| `/app/inventory/loss` | **Stock** | Redirect stub to `/app/inventory` |
| `/app/sales` | **Sales** | Tonight, Day, Week, Month in one screen |
| `/app/sales/categories` | **Sales** | Redirect stub to `/app/sales?view=week` |
| `/app/sales/margins` | **Sales** | Redirect stub to `/app/sales?view=month` |
| `/app/payroll` | **Team & Pay** | Day, week and month views |
| `/app/payroll/employees` | **Team & Pay** | |
| `/app/payroll/direct-deposit` | **Team & Pay** | |
| `/app/payroll/review` | **Team & Pay** | |
| `/app/payroll/split` | **Team & Pay** | Redirect stub to `/app/payroll?view=day` |
| `/app/employees` | **Team & Pay** | Redirect stub to `/app/payroll/employees` |
| `/app/tips` | **Team & Pay** | Separate tab. Contested |
| `/app/tax` | **Team & Pay** | Contested |
| `/app/books` | **Books** | |
| `/app/settings` | **Profile menu** | |
| `/me`, `/me/pending` | **Staff portal** | Separate, untouched |
| `/`, `/privacy`, `/terms`, `/eula`, `/accessibility`, `/thank-you` | Outside the app shell | Public |
| `/login`, `/join`, `/accept-terms` | Outside the app shell | Auth |
| `/setup`, `/setup/pos`, `/setup/pos/clover` | Outside the app shell | Onboarding |
| `/app/no-access` | Outside the app shell | Orphan, kept (screen-pruning, owner decision 1) |

**Routes that fit two homes or none, each with a recommendation**

- `/app/inventory/analytics`: Sales or Stock. **Stock.** The spec listed "analytics" under Sales, but that was the old `/app/analytics`, which now redirects here, and the page is stock velocity, par and shrinkage.
- `/app/reps`: Stock or profile menu. **Stock, as an Ordering tab.** This is the change from the spec, made on the evidence in `matrix.md` and on PRODUCT.md. The mobile FAB already carries "New Rep Order".
- `/app/tax`: Books or Team & Pay. **Team & Pay.** W-2, 1099-NEC and the tax report come from the payroll pipeline. Books is a P&L and does not read them.
- `/app/tips`: a payroll tab or its own place. **Team & Pay, as its own tab.** Tips shows what the POS reported and the payroll day view shows what was allocated; the two disagree today (walk finding #2), and merging them would hide the one place they can be compared.
- `/app/settings`: profile menu. It has no second home. The header already has a user dropdown (`app-header.tsx`, sign out only), which becomes the profile menu.
- `/setup*` is mapped "outside" because it is onboarding. After setup, POS changes live in the Settings POS tab, so it is not a sixth home.
- No route fits none. The org switcher is not a route and is unresolved (manager plan decision 1); if kept it goes in the profile menu.

## 2. Ten tasks, today and under the proposal

**Today.** Desktop sidebar: a section with tabs (Inventory, Payroll) is a toggle button, not a link, so reaching its first screen from elsewhere is 2 clicks (expand, then a child). Single-route items (Dashboard, Sales, Books, Tips, Tax, Reps, Settings) are 1 click. Mobile bottom bar: Home, Inventory, Payroll, Books are 1 tap; everything else is More then the item, 2 taps. Section tabs are 1 tap on both.

**Proposal.** Desktop: five sidebar destinations that navigate on first click (OWNER TO CONFIRM 5), tabs in `SectionTabs`, profile menu in the header. Mobile: bottom bar of the five destinations, no More, profile menu in the header. Team & Pay lands on Pay Period; Stock lands on Items.

**Users.** The owner closing the night (O) and the manager on shift (M).

| # | Task | User | Today, desktop | Today, phone | Proposal, desktop | Proposal, phone | Change |
|---|---|---|---|---|---|---|---|
| 1 | See last night's sales | O, M | Sales: **1** | More, Sales: **2** | **1** | Sales: **1** | Phone shorter by 1 |
| 2 | Adjust or recount an item | M | Inventory (expand), Items: **2** | Inventory: **1** | Stock: **1** | Stock: **1** | Desktop shorter by 1 |
| 3 | Enter a bottle weight report | M | Inventory, Weigh: **2** | Inventory, Weigh tab: **2** | Stock, Weigh tab: **2** | **2** | Same |
| 4 | Record a delivery or invoice | M | Inventory, Shipments: **2** | **2** | Stock, Shipments tab: **2** | **2** | Same |
| 5 | Order from a rep | M | Reps: **1** | More, Reps: **2** (or FAB, New Rep Order: 2) | Stock, Ordering tab: **2** | Stock, Ordering tab: **2** (FAB unchanged: 2) | **Desktop longer by 1** |
| 6 | Share out the night's tips (day split) | O, M | Payroll (expand), Pay Period, Day: **3** | Payroll, Day: **2** | Team & Pay, Day: **2** | **2** | Desktop shorter by 1 |
| 7 | Check tips and server tip percentages | M | Tips: **1** | More, Tips: **2** | Team & Pay, Tips tab: **2** | **2** | **Desktop longer by 1** |
| 8 | Review and approve the pay run | O | Payroll (expand), Review: **2** | Payroll, Review tab: **2** | Team & Pay, Review tab: **2** | **2** | Same |
| 9 | Pay everyone the balance | O | Payroll (expand), Pay Period: **2** | Payroll: **1** | Team & Pay: **1** | **1** | Desktop shorter by 1 |
| 10 | Check the books | O | Books: **1** | Books: **1** | **1** | **1** | Same |

Totals over the ten tasks: desktop 17 clicks today, 16 under the proposal; phone 17 today, 16 under the proposal.

Also checked (rarer, not in the ten):

| Task | Today, desktop | Today, phone | Proposal, desktop | Proposal, phone | Change |
|---|---|---|---|---|---|
| Open Settings (POS, team, import) | Settings: 1 | More, Settings: 2 | Profile menu, Settings: **2** | **2** | **Desktop longer by 1** |
| Stock analytics (par, shrinkage) | Inventory (expand), Analytics: 2 | 2 | Stock, Analytics tab: 2 | 2 | Same |
| W-2 or 1099 at year end | Tax: 1 | More, Tax: 2 | Team & Pay, Tax tab: **2** | 2 | **Desktop longer by 1** |

**Tasks that get longer, called out.** Two of the ten get one click longer, on desktop only: ordering from a rep (5) and the Tips page (7). Two of the rarer tasks do too: Settings and Tax. The cause is the same each time: a screen that was a top-level sidebar item becomes a tab or a menu entry. No phone task gets longer; phone improves or stays equal because More disappears.

**Adjustments, recommended rather than assumed.**

- Task 5 (ordering): the Today screen already links to `/app/reps` three times and deep-links to an order by rep (`/app/reps?order=<id>`). Keep those, and keep "New Rep Order" in the FAB. Entered from Today's low-stock card the task is 1 click on both devices, so for the usual route it is no longer. Ordering from nothing is 2 clicks, and that is the cost of the move. If the owner dislikes that, the alternative is the spec's choice, which makes it worse (avatar, then Reps: also 2, and hidden behind a profile menu).
- Task 7 (tips): the Today tips figure should link straight to `/app/tips` (PRODUCT principle 1: a figure links to the screen that explains it). Whether Today shows tips is not checked here. Without that link the cost stays at 1 extra click.
- Settings in the profile menu: 2 clicks matches the phone today and costs one on desktop for a screen used rarely. Accept.
- **The proposal is not rejected on click count.** Net change is a saving, with desktop regressions of one click on four lower-frequency tasks. The one that matters is ordering, and it is mitigated by existing shortcuts.

**What the counts do not show.** Today's sidebar shows six groups and nine items (Overview, Stock, People & Pay, Money, Ordering, Setup); the proposal shows five. The Money group holds four items (Sales, Books, Tips, Tax) with a different job each. Only Payroll surfaces unfinished work (`OpenRunBanner`); under the proposal the same banner would sit in Team & Pay, and other destinations have no equivalent. That gap is not closed by navigation and is not claimed here.

## 3. Roles

Three roles exist: `owner`, `manager`, `accountant` (`lib/org.ts`). `lib/permissions.tsx` has seven functions and every one gates an **action** (edit or delete inventory, adjust stock, manage categories or reps, manage or submit payroll, approve payroll). None gates a page, and a search of `app/` and `lib/` found no page-level role check; the in-page gates are on actions (settings tabs, team management, POS disconnect).

| Destination | Owner | Manager | Accountant | Basis |
|---|---|---|---|---|
| Today | yes | yes | yes | No gate |
| Stock | yes | yes | yes (read only) | `canEditInventory`, `canAdjustStock`, `canManageReps` gate actions, not the screens |
| Sales | yes | yes | yes | No gate |
| Team & Pay | yes | yes | yes (read only) | `canManagePayroll`, `canSubmitPayroll` gate actions; approval is owner-only (`canApprovePayroll`) |
| Books | yes | yes | yes | No gate |
| Profile menu (Settings) | yes | yes | yes | Tabs are viewable; saving is gated in the tabs |

`visibleDestinations(role)` therefore returns all five for every role, which matches PRODUCT principle 5 (roles gate actions, not understanding). The rule in code is "hide a destination only if the role can use nothing in it". Nothing qualifies today. The accountant case in Stock is marked OWNER TO CONFIRM in the code.

## 4. Competitor signals (`matrix.md`)

**Evidence strength: weak.** Public marketing pages only, ten products, no logins. Several sites blocked or truncated reads, so some navigation is from search snippets, and navigation shape was read directly for only some. An absence on a public page is weak evidence of absence. This can support a placement; it cannot prove one.

Supports:
- **Stock** is a primary area in every inventory product (MarginEdge, BevSpot, WISK, MarketMan, Bar Cop, Restaurant365 "Inventory and Purchasing").
- **Ordering folded into stock** where it exists (Restaurant365, MarketMan, BevSpot "Ordering"), and top-level nowhere. This is the basis for Reps under Stock.
- **Team & Pay** as one area: Square "Staff", Restaurant365 "Workforce Management" and "Payroll and HR", 7shifts, Bar Cop "Scheduling and Shift Cash".
- **Books separate from labour**: Restaurant365 "Accounting" against "Workforce", Bar Cop "Books/P&L", MarginEdge daily P&L.
- **Sales** leads at Lightspeed and Square, and Bar Cop has "Weekly Numbers".

Contradicts or does not support:
- **Today** appears under no such name in any of the ten; the closest are Lightspeed "Advanced Insights" and Square "Reporting", and most sites describe no home view. It rests on Rail's own dashboard and PRODUCT.md.
- **Tax inside Team & Pay** has no competitor evidence either way. It rests on the code (one payroll pipeline).
- **Tips as a tab** is unsupported: 7shifts sells tip management as an add-on to scheduling and payroll, which is consistent with Team & Pay but is a pricing fact, not a navigation one.
- No ten-product comparison speaks to **six tabs in one destination**. The Miller's-limit concern is from the design plan, not the competitors.

## 5. What the current navigation fails by itself

- Six sidebar groups and nine items against Miller's five. Money mixes four different jobs.
- Payroll and Inventory sidebar items are toggles, so the first screen costs two clicks from elsewhere, while the one-click items are the rare ones.
- Mobile More hides Sales, Tips, Tax, Reps and Settings: a daily screen (Sales) takes two taps.
- Only payroll announces unfinished work.
- More than one accent in the sidebar and tabs (not measured here; carried from the critiques).

## 6. What was and was not checked

- Checked: every inventory page maps to one destination (the test parses `route-inventory.md` and fails if a page has no assignment); the six redirect stubs resolve to their targets' destination; click counts from the code.
- Not checked: a browser; a staff account; a real phone; whether Today currently shows a tips figure; whether the redirect stub for `/app/employees` keeps an active-tab state under the rebuild.
- The map has one value beyond the spec's list, `outside`, for public, auth and onboarding paths, which the manager plan's test list uses.
