# Rail native app (iPhone, iPad, Mac): architecture decision record and design

Date: 2026-11-25. Status: decided by the general manager agent under the owner's delegation; nothing here is built yet. Branch `rebuild/foundation`.
Companion file: `docs/superpowers/findings/2026-11-25-native-manager-plan.md` (the work queue, the "not now" list, the owner-only steps).

**How to read this.** Section 1 is the decisions in one line each. Section 2 gives each decision with the options, the reason, the risk and what would change it. Section 3 is the design. Section 4 is the Apple rules, quoted from developer.apple.com as read on 2026-11-25. Sections 5 to 7 are risks, unverified items and the steps only the owner can take.

**Read this first: a finding outside the native work.** While designing the first endpoint I read how the web app resolves a user's role, and it looks wrong for anyone who is not the oldest member of a bar. It is in section 5 as risk R0 and it is item A1 of the work queue. It was found by reading the policy and the query; it has not been tested against a database or in a browser.

---

## 1. Decisions at a glance

| # | Question | Decision |
|---|---|---|
| 1 | Shared stack | **SwiftUI multiplatform.** One Swift package, `RailKit` (models, API client, auth, offline queue, view-models), and one thin app with an iOS/iPadOS destination and a **native macOS destination (not Mac Catalyst)**. The existing web app and PWA stay, and are the Android answer. |
| 2 | Where money logic lives | **On the server, only.** The client displays figures the server computed and never adds, rounds, prorates or converts one. Money and stock cross the wire as decimal strings. Offline shows the last server figures with their time, and queues observations (a count, a weight), never results. |
| 3 | Backend contract | **Versioned `/api/v1` Route Handlers in the existing Next app**, bearer JWT from Supabase Auth obtained through Rail's own `/api/v1/auth/*`, org chosen by an explicit `X-Rail-Org` header checked against the user's own memberships on every request, one error envelope, `Idempotency-Key` on every write, the existing Postgres rate limiter. **Zod schemas are the source of truth**; the OpenAPI 3.1 document is generated from them and drift-tested; the Swift client is **hand-written and thin**, held to the contract by JSON fixtures that both test suites read. **Read-only first.** |
| 4 | First release scope | The five destinations become the tab bar. Release 1.0: read everything a night needs, **count stock and enter weights offline**, notifications with push, the staff pay view. Approving pay, paying people, bank details, setup and settings stay on the web. The Mac's own value is the wide screens: pay run review and the books, read-only in 1.0. |
| 5 | Platform rules | No Sign in with Apple (not required while Rail uses only its own login). In-app account deletion: build it. APNs for native, the VAPID path stays for the web. Face ID lock, tokens in the Keychain, no third-party SDKs. **Subscriptions are sold on the web (Stripe) and the app contains no purchase, price or upgrade screen**, relying on guideline 3.1.3(c). No Apple commission, and one price. How App Review will apply 3.1.3(c) to Rail is unverified. |
| 6 | What to build now | The contract and its pure TypeScript helpers under `lib/api/`, one read-only `GET /api/v1/me`, and the `RailKit` package with models, client, auth and the offline count queue, all proven by `npm test` and `swift test`. Everything needing Xcode, signing or an Apple account is a written step for the owner. |

---

## 2. The decisions

### Decision 1. The shared stack

**Options considered**

| Criterion | SwiftUI multiplatform | React Native + react-native-macos | Capacitor / WKWebView wrapper | PWA only (today) |
|---|---|---|---|---|
| Native design language (Impeccable `ios.md`: the tell of slop is "ported from a website") | Yes: system tab bar, navigation stacks, sheets, Dynamic Type, SF Symbols by default | Possible with care; the default drift is custom controls | **No.** A web page in a shell is the thing the guidance names | No |
| iPhone + iPad + Mac from one codebase | Yes, first-party on all three | iPhone and iPad yes; the Mac port is a separate, smaller project with thinner library coverage | No Mac story | Runs everywhere a browser does |
| One-person team | One language to learn, one toolchain (Xcode), no bridge | Metro, native modules, two build systems, a third for the Mac | Smallest | Nothing to do |
| Money correctness | No TypeScript on the device, so the money code cannot be reused there by accident | `lib/` could be imported into the app, which invites recomputing offline against stale data | Server-rendered, same as web | Same as web |
| Offline counting behind a bar | Yes (local queue, local files) | Yes | **No**: the pages are server-rendered and the actions are server actions | No (the service worker handles push only; `public/sw.js`) |
| Push | APNs | APNs through a module | APNs through a plugin | Web push, on iOS only after "Add to Home Screen" (`app/manifest.ts`) |
| App Store rules | Clean | Clean | Exposed to guideline 4.2 ("beyond a repackaged website") | Not in the store |
| Time to first TestFlight | Gated by the owner-only steps, then real UI work | Same gate, more setup | Shortest after the gate | Not applicable |
| Upkeep beside a fast-moving web app | A second UI, kept small by a narrow contract and server-computed figures | A second UI in a familiar language | Almost none | None |
| Android | No | Yes | Yes | Yes |

**Choice.** SwiftUI multiplatform. `RailKit` is a plain Swift package with no UI and no dependencies. The app is one Xcode project with two destinations that share SwiftUI views and differ only in their navigation container: tab bar on iPhone, sidebar-adaptable tabs on iPad, a split view with a sidebar on the Mac.

**Native macOS, not Mac Catalyst.** The Mac earns its place through tables, several windows, the keyboard and the menu bar (pay run review, the books). SwiftUI gives those on a native Mac destination; Catalyst starts from iPad idioms and has to be pushed towards them. There is also a practical reason on this machine: with no Xcode, macOS is the only platform `RailKit` can be compiled and tested for, so a native Mac target is the one whose non-UI code is proven before Xcode arrives.

**Reason.** The spec's goal was a back end "shaped so [the five destinations] become the mobile app's tab bar without redesign". SwiftUI is the stack where that is literally the default component. It is also the only option that scores on both offline counting and the Mac. Not being able to run the TypeScript money code on the device is a feature here: it removes the temptation behind Decision 2.

**Risk.** A second UI codebase for one person. No Android app: bartenders with Android phones stay on the web staff portal, which already works. SwiftUI has small per-platform differences that need `#if os(macOS)` in places. Nothing visual can be built or checked on this Mac until Xcode is installed.

**What would change it.** The owner saying Android must ship at launch with the same features (then React Native for phones, and the Mac stays on the web). Or the owner wanting a store listing in weeks with no offline (then the PWA is the honest answer, not a wrapper).

### Decision 2. Where money logic lives

**The rule.** Clients display figures computed by the server and never recompute money. That covers pay, tips, tax, COGS, pour cost, margins, stock value, balances and every total, subtotal and percentage of them. The only arithmetic the app may do on a money or stock figure is none. Formatting for display (currency symbol, grouping) is allowed.

**What that requires of the contract**

- Every figure the screen shows is in the response, including totals. If a screen needs a sum, the server sends the sum.
- Money and quantities are **decimal strings** on the wire (`"1234.50"`), never JSON numbers, so no client ever holds them as binary floating point. Scale follows the database: two places for money and stock (`numeric(10,2)`), four for a recorded unit cost (`numeric(12,4)`).
- The API layer **formats, it does not round**. A figure reaching the wire must already be at its scale; the helper throws on one that is not, so a rounding difference between the web screen and the app is a failing test, not a cent of disagreement in production.
- Business dates are strings (`"2026-11-24"`) decided by the server. With a 4am cutoff a 1am ticket belongs to the night before (`lib/business-date.ts`); the app never derives a business date from a clock.
- Pay shown to staff and on an open run comes from `payroll_runs.snapshot`, exactly as `OpenRunBanner` and `/me` do today, never from a recompute.

**What it means offline**

- Offline, the app shows the last figures the server sent, each screen stamped "as of 11:42 pm". It never produces a new total.
- Offline writes are limited to **observations**, things a person saw: "I counted 7 bottles", "this bottle weighs 612 g". The server turns an observation into a delta, a variance and a cost when it arrives.
- Anything that moves money or freezes numbers (cash tips, approve, mark paid, post a shipment) is online-only.

**Options considered.** (a) Port the money functions to Swift: a second source of truth, and the 1,105 tests would cover only one of them. (b) Run the TypeScript in an embedded JavaScript engine on the device: same source, but offline it would compute on stale inputs and present the result as current. (c) Server only: chosen.

**Risk.** Every screen needs a network round trip to change a number; a slow endpoint is a slow screen. The server must send more (all the totals).

**What would change it.** A real need to finish a money task with no signal (for example closing out tips in a basement). That would be a design of its own with its own reconciliation rules, not a relaxation of this rule.

### Decision 3. The backend contract

**Options considered.** (a) The app talks to Supabase directly (PostgREST and RLS). Rejected: `inventory_items` has no member policy at all (only `"platform admins read all inventory"`, `baseline.sql:1714`), so the web reads it with the service role; most writes go through `createAdminClient()` after a role check in TypeScript; many member policies are `FOR ALL` to any member regardless of role (`weigh_reports`, `rep_orders`, `pos_bundles`), so the role gates in `lib/permissions.tsx` exist only in the app layer; six tables have RLS off (already recorded in `2026-11-25-security-review-baseline.md`); and the money logic is not in the database. (b) Supabase Edge Functions: a second runtime that would duplicate `lib/`. (c) tRPC or GraphQL: no gain for a Swift client and a dozen endpoints. (d) **Route Handlers under `app/api/v1/` in the existing app**: chosen. Same deployment, same `lib/`, and `npm run audit:scope` already walks `app/` and `lib/` (`scripts/audit-admin-scope.mjs:34`).

**The design, in rules**

1. **One core, two adapters.** A route handler never calls a server action: every action starts with `getCurrentOrg()`, which reads a cookie and redirects. Each capability the app needs is a core function in `lib/` taking `{ userId, orgId, role }` and plain input (`computePayrollForOrg` is the existing precedent). The server action and the route handler are both thin adapters over it.
2. **Bearer only.** `/api/v1` reads `Authorization: Bearer <access token>` and ignores cookies entirely. One way in, and no cross-site request surface.
3. **Sign-in goes through Rail.** `POST /api/v1/auth/login`, `/refresh` and `/logout` call Supabase Auth on the server and return the session. The app talks to one host, the Supabase URL and anon key are not in the binary, the existing login limiter (`RATE_LIMITS.login`, by IP and by address) and the one generic failure sentence apply unchanged. Alternative considered: the Supabase Swift SDK or direct calls to Supabase Auth. Rejected for now: a dependency, a second host, and Rail's limiter would not see the attempts.
4. **Verify on every request.** The handler calls `supabase.auth.getUser(token)` (authoritative: a revoked user fails) and then builds an RLS client that carries the same bearer. Supabase JS 2.104 in this repo has both `getUser(jwt)` and `getClaims(jwt)`; local verification with `getClaims` is a later optimisation.
5. **Org scope is explicit and re-proved each time.** The app sends `X-Rail-Org`. The server loads **the caller's own** membership rows (filtered by `user_id`, see R0) and resolves the org with a pure, tested function: one membership and no header picks it; several and no header is `org_required` (never "the oldest", which is what the web cookie fallback does); a header naming an org the caller is not in is `forbidden`, the same answer whether or not that org exists. The org id from the header is never used in a query until that check has passed. Nothing is read from JWT custom claims.
6. **RLS client where a policy exists, admin client where the web already uses one.** Reads prefer the bearer RLS client. Where the core function uses `createAdminClient()`, the AGENTS.md invariant holds unchanged: every chain carries `.eq('organization_id', orgId)` or an `admin-scope-ok:` reason, and `npm run audit:scope` must stay at zero unjustified.
7. **Staff are not members.** A staff session comes from `employee_accounts` keyed on the verified user id, through the existing pure `resolveAccountState`. Staff endpoints take their org and employee from that session and from nothing in the request.
8. **Error envelope.** Success is `{ "data": ..., "meta": { "asOf": "<instant>" } }`. Failure is `{ "error": { "code": "snake_case", "message": "a sentence a person can read", "requestId": "...", "details": {...} } }` with the matching HTTP status. Codes: `unauthenticated` 401, `forbidden` 403, `no_membership` 403, `org_required` 400, `not_found` 404, `validation_failed` 422, `conflict` 409, `stale_count` 409, `rate_limited` 429 with `Retry-After`, `upgrade_required` 426, `internal` 500 (always a fixed sentence, never the thrown text).
9. **Idempotency.** Every write requires `Idempotency-Key: <uuid>`, minted by the client when the person opens the form, as `PayEveryoneDialog` does today. Payouts and shipments already enforce a key with a unique index; stock adjustments do not (`adjustStock` writes `usage_logs` with no key, so a retried request would count twice). A generic key table is a migration and belongs to the write phase.
10. **Rate limits.** The existing `checkRateLimit` (Postgres, fixed window). It fails open, which is right for reads; a money write must fail closed, as its own comment says.
11. **Versioning.** The path carries the version. Within `v1` changes are additive only, and clients must tolerate unknown fields and unknown enum values. The app sends `X-Rail-Client: ios/1.0.0`; the server can answer `upgrade_required`, the same idea as `AGENT_MINIMUM_VERSION`.
12. **Wire style.** camelCase keys, instants as ISO 8601 with offset, business dates as `YYYY-MM-DD`, money and quantities as decimal strings, ids as UUID strings.

**Source of truth.** Zod schemas in `lib/api/contract.ts`. `z.toJSONSchema` exists in the installed Zod 4.3.6 (checked), so the OpenAPI 3.1 document is generated with no new dependency, committed at `docs/api/openapi.json`, and a test fails when the committed file and the schemas disagree.

**Swift client: hand-written, not generated.** For about a dozen endpoints a generator adds three runtime dependencies and a build plugin to save a few hundred lines. What a generator really buys is agreement, and that is bought more cheaply: a folder of JSON fixtures that vitest validates against the Zod schemas and `swift test` decodes with the Swift models. One set of files, two suites. If either side drifts, a test goes red.

**Read-only first.** Yes. Phase 0 and 1 have no writes. Writes arrive in order of how reversible they are: observations (counts, weights), then housekeeping (mark read, register a device), then money.

**Risk.** Sign-in through Rail puts a function on the login path, and a bug there locks out the app while the web still works. Extracting cores from pages and actions touches working code (the Today screen queries inside `dashboard/page.tsx`). `getUser` on every request is a network hop.

**What would change it.** A need for OAuth, passkeys or Sign in with Apple (then the Supabase SDK or a web authentication session for sign-in). More than about 25 endpoints or a second native developer (then generate the client from the OpenAPI document).

### Decision 4. First release scope

Navigation is the five validated destinations (`navigation-validation.md`, `lib/nav/destinations.ts`): **Today, Stock, Sales, Team & Pay, Books**. Five is also the most an iOS tab bar holds. The profile menu becomes a toolbar button opening a sheet (bar switch, notification settings, lock, sign out, delete account). Which tabs a user sees comes from the server in `GET /me`, so packages and roles can change it without an app release.

| Persona | In 1.0 (native) | Later native | Stays on the web |
|---|---|---|---|
| **Owner closing the night** (iPhone) | Today: last night's sales, feed health, low stock, the open pay run from its snapshot. Sales: tonight, day, week, month. Team & Pay: the period's figures and who is still owed, read-only. Push for "payroll awaiting approval" and nightly sales, opening the right screen. | Log cash tips. Approve or send back a pay run. Pay the balance. | NACHA export, direct deposit and bank details, tax forms, pay adjustments, employee records, setup, POS, team, settings. |
| **Manager on shift** (iPhone, one hand, dim room) | Stock: the item list with search, **count an item (works offline)**, **enter a weigh report (works offline)**, low-stock list. Today and Sales as above. | Record a delivery from a photo of the invoice. Order from a rep. Barcode scan while counting. | Item setup, categories, pour sizes, bundles, exclusions, imports, shipment voids. |
| **Bartender** (`/me`) | My pay: approved periods with the stub, hours since the last approved period. Same rule as the web: approved figures only, no recompute. | Push when a period is approved. | Joining with the bar's code (account creation stays on the web in 1.0). Android staff stay on the web portal. |
| **Mac** (owner or accountant at a desk) | Everything above in a sidebar layout, plus the two wide screens: **pay run review** (snapshot table and the diff, read-only) and **Books** (the P&L). Several windows, keyboard navigation, sortable tables. | Approve from the review screen once the approval rules are settled. Expenses. | Everything in the web-only column. |

Two reasons approval is not in 1.0. The Payroll Review screen has two open money-integrity findings waiting for the owner (`OVERNIGHT-LOG.md`, morning item 4), and copying a screen whose rules are undecided would copy the problem. And keeping every money-moving action out of the first build keeps the first App Review simple.

Bank details and anything that sends money stay off the device entirely. That is also the cautious reading of guideline 3.2.1(viii), quoted in section 4.

**Staging.** TestFlight build 0.1 is read-only (sign in, pick a bar, Today, Sales, Stock list, pay summary, the staff view). 1.0 adds counting and weighing offline, push, the lock and account deletion.

### Decision 5. Platform services and rules

| Topic | Decision | Basis |
|---|---|---|
| Sign in with Apple | **Not added.** Rail uses only its own email and password (and a magic link). If Google or another social login is ever added, Sign in with Apple or an equivalent must be added with it. | Guideline 4.8, verified, section 4. |
| Account deletion | **Build it**, reachable from the profile sheet, even though 1.0 does not create accounts in the app. A staff or member account is removed with its login. Pay history belongs to the bar's payroll records and stays. A sole owner must hand the bar over or ask for it to be closed. No account-deletion code exists in the repo today (only the demo purge deletes users), so this is new server work that the web needs too. | Guideline 5.1.1(v) and Apple's support page, verified. Retention law: unverified, for counsel. |
| Push | **APNs for native; the VAPID web push path stays as it is.** A separate table for APNs device tokens (the existing `push_subscriptions` has `endpoint`, `p256dh` and `auth` NOT NULL and should not be loosened). `dispatch()` fans out to both. The `notifications` row and its `dedupe_key` stay the source of truth; a push is only a hint to open it. Same deletion rule as today: only the push service saying "this device is gone" removes a row. | Existing design in `lib/notifications/`. APNs specifics: unverified. |
| Deep links | The server adds the destination to each notification (from `destinationFor(link)`), so the route table is not copied into Swift. | `lib/nav/destinations.ts`. |
| Biometric lock | Face ID or Touch ID with passcode fallback when the app returns after a few minutes, on by default for members. It is a lock on the screen, not a second factor for the server. | Pay and tips are on screen. |
| Keychain | Access and refresh tokens in the Keychain, this device only, readable after first unlock so a background refresh works. Never in user defaults. Behind a `TokenStore` protocol so the logic is testable now and the Keychain code is written when Xcode exists. | |
| Local data | The last good response per screen and bar, as files with data protection, wiped on sign-out. No bank details ever reach the device. No local database in 1.0. | Decision 2. |
| Offline queue | See section 3.5. | |
| Privacy manifest and labels | **No third-party SDKs in 1.0** (no analytics, no crash reporter, no Supabase SDK), so the manifest covers only Rail's own code and there is no tracking. Labels to declare, at least: name, email address, user ID, other financial info (pay), other user content (notes). | Labels page verified. Manifest keys: unverified (the documentation page did not render). |
| Demo account for review | A long-lived reviewer bar with an owner login and a staff login. It must not be a `/api/demo` org: those are swept by age and would vanish during review. | Guideline 2.1, verified. |
| Enrolment | **As an organisation, not an individual.** | Guideline 5.1.1(ix), verified. |

**The subscription question.** Rail is software sold to a bar, which is an organisation, for the people who work there, and it is sold by Rail directly (a call, then Stripe on the web, as the rebuild spec already decided).

- Decision: **the subscription is bought on the web. The app is free to download, sign-in only, and has no purchase, no price, no plan picker and no upgrade prompt.** A lapsed bar sees a neutral sentence and nothing to tap. This relies on guideline **3.1.3(c) Enterprise Services**.
- Not relied on: 3.1.3(a) reader apps (media only), 3.1.3(f) free companion apps (VoIP, cloud storage, email and web hosting only), 3.1.3(b) multiplatform services (it requires the same items to be offered as in-app purchases as well).
- On the United States storefront the current text also allows buttons and links to other ways to pay. Rail's first customers are in the US, so the app ships on the US storefront only at first. The decision does not depend on that allowance; it is a second line of defence.

**Consequence for pricing.** One price, set on the web, with no Apple commission and no "in-app price" to keep in step. Packages are enforced by the server (the tabs in `GET /me`), not by the store. If App Review were to insist on in-app purchase, the price inside the app would have to carry Apple's commission or the margin would; that is the fallback, not the plan, and the commission rate is unverified.

**Risk.** The sentence in 3.1.3(c) ends "Consumer, single user, or family sales must use in-app purchase." A bar with one owner and no managers can look like a single user. The answer is true and worth stating in the review notes: the customer is a business, the staff sign in to the same app, and the sale is made directly. Whether a public self-serve checkout weakens "only sold directly by you to organizations" is unverified.

**What would change it.** A rejection under 3.1.1 that survives an appeal. Then, in order: unlisted distribution (still reviewed, but framed as a business tool for a known audience), private distribution to specific organisations through Apple's business programme (unverified), or offering in-app purchase beside the web price.

### Decision 6. What to build now

No Xcode app and no developer account means no iOS build, no simulator, no signing. What can be proven here is everything that is not a screen:

1. The role fix found on the way (A1).
2. The contract: envelope, bearer parsing, wire decimals, Zod schemas, the generated OpenAPI document, the shared fixtures (A2 to A4).
3. One real endpoint, `GET /api/v1/me`, read-only, using the caller's own token and no service role (A5).
4. `RailKit`: Codable models that decode the fixtures, an API client over an injectable transport, a token session with single-flight refresh behind a protocol, and the offline count queue as a pure value type (A6 to A8).

Measured on this Mac on 2026-11-25: Swift 6.4.2 command-line tools only; a throwaway package built and passed `swift test` using **Swift Testing** (`import Testing`), and reading a JSON fixture through `Bundle.module` worked; **`import XCTest` does not resolve** without Xcode; `xcrun --sdk iphoneos` finds no SDK. So `RailKit` tests use Swift Testing and are compiled for macOS only.

---

## 3. Design

### 3.1 Repository layout

```
lib/api/                      pure contract code and tests (vitest picks up lib/**/*.test.ts)
lib/supabase/bearer.ts        RLS client carrying a caller's bearer token
app/api/v1/<name>/route.ts    thin adapters, nothing but I/O
docs/api/openapi.json         generated, committed, drift-tested
native/RailKit/               Swift package, no dependencies
native/RailKit/Tests/RailKitTests/Fixtures/   the shared JSON fixtures
native/RailApp/               the Xcode project (owner creates it; not an agent task)
```

`native/` holds no TypeScript, so `tsc` and ESLint are unaffected. `.build/` and `.swiftpm/` need a `.gitignore` entry.

### 3.2 Authentication flow

1. `POST /api/v1/auth/login` with email and password returns `{ accessToken, refreshToken, expiresAt, user }`. Rate-limited by IP and by address. One generic failure message.
2. The app stores both tokens in the Keychain and calls `GET /api/v1/me`.
3. Every request carries the access token. The client refreshes shortly before expiry and on a single 401, **one refresh at a time** however many requests are waiting, because refresh tokens are expected to rotate and two parallel refreshes could end the session (rotation settings: unverified).
4. A failed refresh clears the tokens and returns the person to sign-in. Unsent counts stay on the device, bound to their user and bar.
5. `POST /api/v1/auth/logout` revokes the session on the server.

Magic links need universal links (an associated domain and a signed app), so they wait for Xcode. Password sign-in covers 1.0.

### 3.3 `GET /api/v1/me`, the first endpoint

Needs no org header; it is the call that tells the app which bars exist.

```json
{ "data": {
    "user": { "id": "...", "email": "..." },
    "memberships": [
      { "orgId": "...", "orgName": "...", "role": "manager",
        "destinations": ["today", "stock", "sales", "team-pay", "books"] }
    ],
    "activeOrgId": "...",
    "staff": { "kind": "none" }
} }
```

`activeOrgId` is null when the caller has several bars and sent no header, or sent one they do not belong to; the app then asks. `staff.kind` is `active` (with `orgId` and `employeeId`), `pending` or `none`, from the existing `resolveAccountState`. The handler uses only the caller's token: memberships through the RLS client filtered to the caller's own rows, and the caller's own `employee_accounts` row (policy `"employees read their own account"`). No service role, so nothing for `audit:scope` to judge.

### 3.4 Endpoints by phase (names only)

| Phase | Endpoints | Needs |
|---|---|---|
| 0, now | `GET /me`. Contract only, not implemented: `POST /auth/login`, `/auth/refresh`, `/auth/logout` | Nothing |
| 1, read-only | `GET /today`, `/sales`, `/stock/items`, `/stock/items/{id}`, `/stock/weigh-reports`, `/pay/period`, `/pay/run/open`, `/pay/run/{id}/diff`, `/pay/payouts`, `/books`, `/notifications`, `/staff/periods`; the three auth routes | Cores extracted from `dashboard/page.tsx`, `getSalesData`, `getPeriodSalesData`, `computePayroll`, `getOpenPayrollRun`, `getPayrollRunDiff`, `loadPayouts`, `getBooksData`, `getNotifications`, `getMyPeriods`. A dev sign-in to test against. |
| 2, observations and housekeeping | `POST /stock/counts`, `POST /stock/weigh-reports`, `POST /notifications/{id}/read`, `PUT /devices/apns`, `POST /account/deletion-request` | Migrations: an idempotency table, an APNs device table. The count conflict rule under test. |
| 3, money | `POST /pay/cash-tips`, `/pay/run/{id}/approve`, `/pay/run/{id}/request-changes`, `/pay/payouts` | The owner's approval rules. `cash_tips_source = 'manual'` honoured. The existing payout idempotency keys reused. |

### 3.5 Offline counting and its conflict rules

Facts from the code: `adjustStock` takes `mode: 'set' | 'delta'`; POS sales lower `current_stock` every five minutes; `usage_logs.logged_at` is when a row was inserted, not when the drink was sold, so a sale rung before a count can arrive after it.

Rules:

1. **The queue holds observations.** `{ id (the idempotency key), userId, orgId, itemId, countedQuantity, countedAt, baseAsOf, note }`. `baseAsOf` is the server's own timestamp from the item list the counter was looking at.
2. **An entry belongs to one user and one bar** and is never sent under any other. Signing in as someone else, or switching bars, leaves it waiting.
3. **Nothing leaves the queue without the server's answer or a person's decision.** A network failure keeps the entry. A newer count of the same item by the same person replaces their older unsent one, and that is the only automatic removal.
4. **The server never guesses.** A count is applied only if no stock movement for that item has been logged since `baseAsOf`; in that case it is exactly what the web does today. Otherwise the answer is `stale_count` with the current figure and what moved ("3 sold, 1 case delivered since you counted 7 at 11:42 pm"), and the person chooses: apply my count, recount, or discard. No last-write-wins, and no automatic rebasing, because the two clocks make a silent rebase subtract some sales twice.
5. **The device clock is not trusted.** Staleness is judged on `baseAsOf`; `countedAt` is kept for the note.
6. Oldest first. Two phones counting the same item: the second gets `stale_count`.
7. Weigh reports are documents with client-made ids, so creating one twice is harmless. Their items have no `organization_id`; the parent is verified first, as `assertItemInOrg` does.

### 3.6 `RailKit`

- `Models`: Codable structs mirroring the contract. `Money` and `Quantity` wrap `Decimal` and decode only from a well-formed decimal string. `BusinessDate` wraps the string. Enums decode unknown values to `.unknown` so an additive server change cannot crash an old app.
- `HTTPTransport` protocol with a `URLSession` implementation; tests inject a fake.
- `TokenStore` protocol with an in-memory implementation now and a Keychain one later.
- `AuthSession` (an actor): current tokens, refresh before expiry, single-flight refresh, injected clock.
- `RailAPI`: builds requests (bearer, `X-Rail-Org`, `X-Rail-Client`), decodes the envelope, maps errors to a typed error, retries once after a 401.
- `CountQueue`: a pure value type implementing 3.5, Codable so it can be saved as a file.
- View-models arrive with the screens. They hold state and call `RailAPI`; they contain no arithmetic on money.

Floor: iOS 17, iPadOS 17, macOS 14 as a starting default (device adoption not checked). Swift 6 language mode.

### 3.7 Screens and navigation per device

| | iPhone | iPad | Mac |
|---|---|---|---|
| Top level | Tab bar: the five | The same tabs, shown as a sidebar when wide | Sidebar: the five |
| Within a destination | Navigation stack, large title at the top level | List and detail side by side | List and detail; `Table` for pay and books |
| A focused task (count, weigh) | Sheet with Cancel and Done | Sheet or popover | Sheet or its own window |
| Profile | Toolbar button, sheet | Same | Settings window and the app menu |
| Staff | One stack, "My pay", no tabs | Same | Same |

System components throughout, Dynamic Type, semantic colours, SF Symbols, both appearances, 44 pt targets. Rail's amber is the one tint. The monospace heading face may appear in display moments; body and controls stay on the system font (`ios.md`).

---

## 4. Apple's rules, as read

Source for every guideline quote: App Store Review Guidelines, https://developer.apple.com/app-store/review/guidelines/ , read 2026-11-25; the page says "Last Updated: October 16, 2026". Re-read before submitting; these change.

- **3.1.1 In-App Purchase.** "If you want to unlock features or functionality within your app, (by way of example: subscriptions, in-game currencies, game levels, access to premium content, or unlocking a full version), you must use in-app purchase."
- **3.1.3(c) Enterprise Services.** "If your app is only sold directly by you to organizations or groups for their employees or students (for example professional databases and classroom management tools), you may allow enterprise users to access previously-purchased content or subscriptions. Consumer, single user, or family sales must use in-app purchase."
- **3.1.3, opening.** "Apps in this section cannot, within the app, encourage users to use a purchasing method other than in-app purchase, except for apps on the United States storefront and as set forth in 3.1.1(a) and 3.1.3(a). Developers can send communications outside of the app to their user base about purchasing methods other than in-app purchase."
- **3.1.1(a).** "These entitlements are not required for developers to include buttons, external links, or other calls to action in their United States storefront apps."
- **3.1.3(b) Multiplatform Services.** Access to things bought elsewhere is allowed "provided those items are also available as in-app purchases within the app."
- **3.1.3(a) Reader apps** covers "magazines, newspapers, books, audio, music, and video". **3.1.3(f)** covers "VoIP, Cloud Storage, Email Services, or Web Hosting". Neither describes Rail.
- **3.1.2(a)** lists "software as a service ("SAAS")" among appropriate auto-renewable subscriptions, which is what Rail's would be if it were ever sold in the app.
- **4.8 Login Services.** Another login service is required for "Apps that use a third-party or social login service". It "is not required if: Your app exclusively uses your company's own account setup and sign-in systems."
- **5.1.1(v).** "If your app supports account creation, you must also offer account deletion within the app."
- **5.1.1(i).** A privacy policy link is required "in the App Store Connect metadata field and within the app in an easily accessible manner." (`/privacy` exists.)
- **5.1.1(ix).** "Apps that provide services in highly regulated fields (such as banking and financial services, healthcare, gambling, legal cannabis use, air travel and crypto exchanges) or that require sensitive user information should be submitted by a legal entity that provides the services, and not by an individual developer."
- **3.2.1(viii).** "Apps used for financial trading, investing, or money management should be submitted by the financial institution performing such services".
- **4.2 Minimum Functionality.** "Your app should include features, content, and UI that elevate it beyond a repackaged website."
- **2.1(a).** "include demo account info (and turn on your back-end service!) if your app includes a login."

Other pages, all read 2026-11-25:

- Account deletion, https://developer.apple.com/support/offering-account-deletion-in-your-app/ : "only offering to temporarily deactivate or disable an account is insufficient"; a link to a web page that completes the deletion is acceptable if it goes "directly to the page"; a manual process that takes time is acceptable if the person is told how long; the developer may keep data it is "legally required to maintain".
- Privacy labels, https://developer.apple.com/app-store/app-privacy-details/ : "if you collect data solely for the purpose of app functionality, declare the data on your label". "Other Financial Info" is "salary, income, assets, debts, or any other financial information".
- Upcoming requirements, https://developer.apple.com/news/upcoming-requirements/ : since April 28, 2026, "Apps uploaded to App Store Connect must be built with Xcode 26 or later"; since May 1, 2024, "You'll need to include approved reasons for the listed APIs used by your app's code (including from third-party SDKs)".
- Enrolment, https://developer.apple.com/programs/enroll/ : "99 USD per membership year". An organisation "must be a legal entity", needs a D-U-N-S Number, a public website on its own domain, and a person with "the legal authority to bind your organization". "We do not accept DBAs, fictitious business names, trade names, or branches."
- TestFlight, https://developer.apple.com/testflight/ : up to 100 internal testers; up to 10,000 external testers once the first build is "approved by App Review for TestFlight".
- Unlisted distribution, https://developer.apple.com/support/unlisted-app-distribution/ : discoverable "only with a direct link"; the app must still be "submitted to App Review".

---

## 5. Risks

| # | Risk | What limits it |
|---|---|---|
| **R0** | **The web may give a manager or accountant the owner's role.** `getCurrentOrg()` (`lib/org.ts:139-142`) selects `memberships` with no `user_id` filter and relies on RLS. The exported policy `"users see memberships in their orgs"` (`baseline.sql:1744`) lets a member see every membership row in their bar. The rows are ordered oldest first and the code takes the first row for the bar, which is normally the owner's. If so, anyone added to a bar later is treated as owner by every `can…(role)` check. **Read from code and the schema export; not tested.** Most bars have one owner and no one else, which would explain it going unseen, and the overnight walk never signed in as a second member. | Work queue A1: filter to the caller's own rows, in the query and in a tested pure function. Correct under either reading of the policy. The owner should confirm on live with the two queries in the plan file, and should know that after the fix managers lose abilities they may have been using. |
| R1 | App Review reads Rail as a single-user sale and demands in-app purchase. | No purchase UI at all; review notes stating the 3.1.3(c) case; US storefront first; the fallbacks in Decision 5. |
| R2 | A second UI drifts from the web. | Server-computed figures, tabs sent by the server, a narrow read-first contract, fixtures tested on both sides. |
| R3 | The app and the web show different cents. | Decimal strings, a helper that refuses a figure not at scale, and one rounding function per figure shared by both adapters. |
| R4 | An offline count erases real sales. | Rule 4 in section 3.5: never applied silently once stock has moved. |
| R5 | A queued count is sent under the wrong bar or user. | Entries are bound to user and bar; tested. |
| R6 | Member policies are blind to role, so the app-layer role checks are the only gate. | The app never talks to PostgREST. Recorded here for the owner; not changed by this work. |
| R7 | Nothing visual can be checked until Xcode exists; `RailKit` is proven for macOS only. | Keep `RailKit` free of UI and of platform-specific code. Screens are a later phase with the owner watching. |
| R8 | Sign-in through Rail fails and locks out the app. | Not built now. It needs a real sign-in against the dev project to test, with a human present. |
| R9 | A pay figure on a lock screen. | Push text matches the in-app row today; a setting to hide amounts is a later choice for the owner. |

## 6. Unverified

1. How App Review applies 3.1.3(c) to a small-business product with one-owner customers and a public web checkout.
2. Apple's commission rates and small-business programme terms (not read today).
3. How long the United States storefront allowance for external links will stand.
4. Privacy manifest key names and the list of required-reason APIs: the documentation page returned no text. Only the requirement itself was verified.
5. APNs details (key-based authentication, which responses mean a dead device, payload limits): from general knowledge.
6. Whether one app record serves iPhone, iPad and Mac with one listing, and the Mac App Store's sandbox requirements.
7. This Supabase project's access-token lifetime, refresh-token rotation and reuse detection, signing-key type, and Supabase's own limits on auth endpoints.
8. That `proxy.ts` makes no network call for an `/api/v1` request with no cookies (its matcher does cover `/api`).
9. Whether Xcode 26 or later installs on this macOS, and whether a newer minimum applies by submission day.
10. How long D-U-N-S and enrolment take.
11. Which payroll records must be kept, and for how long, when an account is deleted (counsel).
12. The share of staff phones that are Android (owner).
13. Whether SwiftUI code compiles under the command-line tools alone. Only a Foundation-only package with Swift Testing was tried.
14. TestFlight build lifetime and its platform list (not stated on the page read).
15. Whether the name "Rail" is free on the App Store.
16. R0 and R6 are read from the schema export and the code, not exercised.

## 7. Steps only the owner can take

Listed in order in the plan file. In short: confirm R0 on live; decide the legal entity and get a D-U-N-S number; enrol as an organisation (99 USD a year); install Xcode; choose the bundle id and app name; create the Xcode project around `native/RailKit`; create the APNs key; fill in App Store Connect (privacy answers, review notes, a standing reviewer bar); TestFlight; set the price and sell it on the web; ask counsel about deletion and retention.
