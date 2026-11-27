# Manager plan: native app workstream (2026-11-25)

Written by the general manager agent. Read-only on code: this file and `docs/superpowers/specs/2026-11-25-native-app-architecture.md` are the only things written. Branch `rebuild/foundation`. Every decision behind the queue is in the architecture file; an implementer does not reopen one.

**Roles.** Sonnet implements. Opus is called only to debug a gate that fails, once per failed gate; a second failure is a revert. The orchestrator dispatches, commits and logs.

## Read this first: a possible role bug in the web app (item A1)

Found while designing the first endpoint, by reading. **Not tested against a database or in a browser.**

- `lib/org.ts:139-142` (`getCurrentOrg`) selects `memberships` with no `user_id` filter and relies on RLS to narrow it.
- The exported policy `"users see memberships in their orgs"` (`supabase/schema-export/baseline.sql:1744`) allows a member to read **every** membership row of a bar they belong to, not only their own. The only other policy on the table is owner-only (`:1742`).
- The rows are ordered `created_at` ascending and the code takes the first row for the active bar (`lib/org.ts:159`). The oldest row in a bar is normally the owner's, written at setup.
- So a manager or accountant added later would be handed `role: 'owner'`, and every check in `lib/permissions.tsx` would pass for them: approving a pay run, the NACHA export, deleting inventory, managing the team.
- Why it could go unseen: most bars are one owner and nobody else, demo bars have one member, and the overnight walk never signed in as a second member.

A1 fixes it in the code, in a way that is correct whichever way the live policy reads. The owner should confirm on live (queries in the owner-only list) and should expect that, after the fix, managers and accountants lose owner abilities they may have been using.

## Baseline measured before writing this plan

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm test` | 65 files, 1105 tests, all pass |
| `npm run audit:scope` | 25 justified, 0 unscoped and unjustified |
| `npm run lint` | 45 problems: 12 errors, 33 warnings |
| Working tree | clean |
| Swift | 6.4.2, command-line tools only (`/Library/Developer/CommandLineTools`); no Xcode; `xcrun --sdk iphoneos` finds no SDK |

Measured in a throwaway package outside the repo: `swift test` passes with **Swift Testing** (`import Testing`); a JSON fixture declared as `resources: [.copy("Fixtures")]` is readable through `Bundle.module.url(forResource:withExtension:subdirectory:)`; **`import XCTest` does not resolve** without Xcode. `z.toJSONSchema` exists in the installed Zod 4.3.6.

## Guardrails (non-negotiable)

1. **Nothing live.** No live database, no migration, no push, no deploy, no key rotation, no real email, SMS or payment, no Apple account action, no spending money.
2. **Do not invent owner facts.** No bundle id, team id, company name, price or support address. Fixtures use `example.com` and made-up UUIDs only.
3. **Money, tips, stock, tenancy:** a failing test first, one separate revertable commit per change. Existing tests are never edited to pass.
4. **No new dependencies**, npm or Swift. `RailKit` has none.
5. **No route handler calls a server action**, and nothing under `app/api/v1` reads a cookie.
6. **No `createAdminClient` in this queue.** Every item uses pure code or the caller's own token.
7. **Swift tests use Swift Testing, never XCTest.** `RailKit` imports Foundation only: no SwiftUI, UIKit, AppKit or Security in this queue.
8. Never print a secret. Never read `.env*`. Do not use `git stash` (shared tree).
9. **A task that cannot be made green is reverted** (its uncommitted changes and new files), logged, and the queue moves on.
10. Before writing a route handler, read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (AGENTS.md rule).

**GATES** (every item):

```bash
npx tsc --noEmit
npm test
npm run audit:scope
npm run lint          # must not exceed 45 problems / 12 errors
```

**SWIFT GATES** (items A6 to A8, in addition):

```bash
swift build --package-path native/RailKit
swift test  --package-path native/RailKit
```

**Log.** The orchestrator appends to `docs/superpowers/OVERNIGHT-LOG.md` under a new heading `## Native app workstream (2026-11-25)`, one line per item in the form given below, newest at the bottom.

---

## Ordered work queue (eight items)

### A1. The caller's own memberships only (tenancy; two commits)

- **Model.** sonnet.
- **Files.** New: `lib/api/org-scope.ts`, `lib/api/org-scope.test.ts`. Edited in commit 2 only: `lib/org.ts`.
- **Failing test first (commit 1).** In `org-scope.test.ts`, red before the implementation exists:
  - `ownMemberships(rows, userId)` keeps only rows whose `user_id` equals `userId`.
  - The named case: rows `[owner's row (oldest), manager's row]` in one bar, called with the manager's id, returns the manager's row and its role is `manager`.
  - A row with no `user_id` is dropped. `null` or `undefined` rows give `[]`.
  - `pickOrg(memberships, requested)`: no memberships gives `no_membership`; one membership and no request picks it; several and no request gives `org_required` (never the oldest); a request matching a membership picks it; a well-formed id not among them gives `forbidden`; a malformed id gives `validation_failed`; comparison ignores case and surrounding spaces.
- **Commit 2 (separate, revertable).** In `getCurrentOrg` only: add `user_id` to the select, add `.eq('user_id', user.id)`, and pass the rows through `ownMemberships(raw, user.id)` before the empty check. `OrgMembership` may gain `user_id: string`. Nothing else in the file changes.
- **Acceptance.** GATES. `git grep -n -A4 "from('memberships')" lib/org.ts` shows the `user_id` filter.
- **Log line.** `- **A1 done** (sonnet): getCurrentOrg now resolves only the caller's own membership rows (lib/api/org-scope.ts, N tests, red first; lib/org.ts in its own commit <sha>). Read from code and the schema export; NOT verified against a database. Owner to confirm with the two queries in the native plan and to expect managers losing owner abilities.`
- **Stop condition.** If `tsc` demands a change to any file other than `lib/org.ts` and the two new files, revert commit 2 only, keep commit 1, and log it. Do not touch an RLS policy and do not write a migration.

### A2. API envelope and bearer parsing (pure, not wired)

- **Model.** sonnet.
- **Files.** New: `lib/api/envelope.ts`, `lib/api/envelope.test.ts`, `lib/api/bearer.ts`, `lib/api/bearer.test.ts`.
- **Failing test first.**
  - `API_ERROR_STATUS` holds exactly: `unauthenticated` 401, `forbidden` 403, `no_membership` 403, `org_required` 400, `not_found` 404, `validation_failed` 422, `conflict` 409, `stale_count` 409, `rate_limited` 429, `upgrade_required` 426, `internal` 500.
  - `ok(data, meta?)` returns `{ status: 200, body: { data, meta? } }`; `fail(code, message, opts?)` returns `{ status, body: { error: { code, message, requestId?, details? } }, headers }`. Both return plain objects, not a `NextResponse`.
  - `fail('internal', anything)` always carries one fixed sentence, never the text passed in.
  - `fail('rate_limited', m, { retryAfterSeconds: 0 })` sets `Retry-After: '1'` (minimum 1, as `app/api/demo/route.ts` does).
  - A body never has both `data` and `error`.
  - `parseBearer('Bearer abc.def.ghi')` returns the token; the scheme is case-insensitive; `null`, `''`, `'Basic x'`, `'Bearer'`, `'Bearer a b'` and a token longer than 8192 characters return `null`.
- **Acceptance.** GATES.
- **Log line.** `- **A2 done** (sonnet): v1 envelope and bearer parsing, pure, N tests red first, not wired. 1 commit. Gates green.`
- **Stop condition.** Any need to change a file outside `lib/api/`.

### A3. Wire decimals (money; own commit)

- **Model.** sonnet.
- **Files.** New: `lib/api/decimal.ts`, `lib/api/decimal.test.ts`.
- **Failing test first.** `toDecimalString(n, places)` with `places` of 2 or 4:
  - `12.5` gives `'12.50'`; `0` and `-0` give `'0.00'`; `0.1 + 0.2` gives `'0.30'`; `1234567.89` gives `'1234567.89'`; `-0.5` gives `'-0.50'`; `0.0625` at 4 places gives `'0.0625'`.
  - It **formats and does not round**: a value not already at its scale (`1.005`, `12.345` at 2 places) throws `RangeError`. `NaN`, `Infinity` and a magnitude of `1e15` or more throw. The output never contains an exponent.
  - Every output matches `/^-?\d+\.\d{2}$/` (or four digits at 4 places).
- **Acceptance.** GATES.
- **Log line.** `- **A3 done** (sonnet): toDecimalString, the only way a money or stock figure reaches the wire; formats, refuses a figure not at scale. N tests red first. 1 commit. Gates green.`
- **Stop condition.** Do not import or change `round2` or any existing money function. If a test seems to need one changed, stop and log.

### A4. Contract schemas, the OpenAPI document and the shared fixtures

- **Model.** sonnet.
- **Files.** New: `lib/api/contract.ts`, `lib/api/contract.test.ts`, `lib/api/openapi.ts`, `lib/api/openapi.test.ts`, `docs/api/openapi.json` (generated, committed), and in `native/RailKit/Tests/RailKitTests/Fixtures/`: `me.member.json`, `me.two-orgs.json`, `me.staff.json`, `auth.session.json`, `error.unauthenticated.json`, `error.rate-limited.json`.
- **What it holds.** Zod schemas: decimal strings, instant, business date, role, destination, the error envelope, the `me` response (shape in the architecture file, section 3.3), the auth session and the login and refresh requests. One `API_OPERATIONS` table: method, path, `auth` (`none` or `bearer`), `orgScoped`, request and response schemas, error codes, and `status` (`implemented` for `GET /api/v1/me`, `planned` for the three auth routes). `buildOpenApiDocument()` turns the table into OpenAPI 3.1 with `z.toJSONSchema`.
- **Failing test first.**
  - Every fixture file parses under the schema its name maps to; a fixture with no schema fails; a schema with no fixture fails.
  - `JSON.stringify(buildOpenApiDocument(), null, 2) + '\n'` equals `docs/api/openapi.json` byte for byte. With `UPDATE_OPENAPI=1` the test rewrites the file instead (`UPDATE_OPENAPI=1 npm test -- lib/api/openapi.test.ts`).
  - Every path starts with `/api/v1/`; every `bearer` operation lists `unauthenticated`; every error code used is a key of `API_ERROR_STATUS`; the document's `openapi` field is `3.1.0`.
  - The role and destination schemas accept exactly the values in `lib/permissions.tsx` and the five in `lib/nav/destinations.ts`.
- **Acceptance.** GATES. `git status` shows only the files listed.
- **Log line.** `- **A4 done** (sonnet): Zod contract, generated docs/api/openapi.json with a drift test, six shared fixtures. N tests red first. 1 commit. Gates green.`
- **Stop condition.** If a schema cannot be expressed through `z.toJSONSchema` without a new dependency, simplify the schema; never add the dependency.

### A5. `GET /api/v1/me`, read-only (tenancy; own commit)

- **Model.** sonnet.
- **Files.** New: `lib/api/me.ts`, `lib/api/me.test.ts`, `lib/supabase/bearer.ts`, `app/api/v1/me/route.ts`.
- **Shape.** `buildMe({ user, membershipRows, accountRow, requestedOrg })` in `lib/api/me.ts` is pure and reuses `ownMemberships`, `pickOrg`, `visibleDestinations` and `resolveAccountState`. The route is the only I/O: `parseBearer`; a client from `createBearerClient(token)` (anon key plus the caller's `Authorization` header, no session persistence); `auth.getUser(token)`; the caller's memberships (`user_id, organization_id, role, organizations(id, name)` with `.eq('user_id', user.id)`); the caller's own `employee_accounts` row (`organization_id, employee_id, status` with `.eq('user_id', user.id)`). `export const runtime = 'nodejs'`.
- **Failing test first.**
  - One membership: it is listed with its role and five destinations, and `activeOrgId` is its org.
  - Two memberships and no requested org: both listed, `activeOrgId` is `null`. A requested org the caller is not in: `activeOrgId` is `null` (this endpoint never fails on org, because it is how the app recovers from a stale choice).
  - Rows belonging to another user are ignored even if passed in.
  - A role outside owner, manager, accountant drops that row.
  - No memberships and an active account: `memberships` is empty and `staff` is `{ kind: 'active', orgId, employeeId }`. Pending gives `{ kind: 'pending' }`. Revoked or absent gives `{ kind: 'none' }`. A staff account never produces a membership.
  - Every result passes the `me` schema from A4.
- **Acceptance.** GATES, then `npm run build` exit 0 (if a running dev server makes the build fail on a lock, skip it and say so in the log). Optional, only if `node --no-warnings scripts/dev/check-dev-env.ts` exits 0 and a dev server is already on port 3000: `curl -s -i localhost:3000/api/v1/me` returns 401 with code `unauthenticated`. Send no token, do not sign in, do not create a demo bar.
- **Log line.** `- **A5 done** (sonnet): GET /api/v1/me, bearer only, the caller's own token and no service role; buildMe pure, N tests red first. 1 commit. Gates green, build <exit>. Unauthenticated 401 <checked | not checked>. NOT exercised with a real token.`
- **Stop condition.** If the route would need `createAdminClient`, a cookie, or a call to any server action, stop and log.

### A6. `RailKit` package and models

- **Model.** sonnet.
- **Files.** New: `native/RailKit/Package.swift`; `native/RailKit/Sources/RailKit/Models/WireTypes.swift` (`Money`, `Quantity`, `BusinessDate`, `Role`, `Destination`), `Models/Envelope.swift`, `Models/Me.swift`, `Models/Session.swift`; `native/RailKit/Tests/RailKitTests/FixtureDecodingTests.swift`, `Tests/RailKitTests/WireTypesTests.swift`. Edited: `.gitignore` (add `native/**/.build/` and `.swiftpm/`).
- **Package.** `// swift-tools-version: 6.0`; platforms `.iOS(.v17)`, `.macOS(.v14)`; one library target, one test target with `resources: [.copy("Fixtures")]`; no dependencies.
- **Failing test first** (the tests are written first; a test target that does not compile is the red).
  - Every fixture from A4 decodes into its model.
  - `Money` decodes only from a string of the form `-?digits.dd`: it rejects `"12.5"`, `"12.500"`, `"1e3"`, `""`, `"NaN"`, `" 12.50"` and a JSON number; it accepts `"-0.50"`; it encodes back to the identical string.
  - An unknown role (`"bouncer"`) and an unknown destination decode to `.unknown(...)` and do not throw. Unknown JSON keys are ignored. A missing required key throws.
- **Acceptance.** SWIFT GATES, then GATES. `git status` shows no `.build` directory.
- **Log line.** `- **A6 done** (sonnet): native/RailKit scaffold, Codable models decode the shared fixtures, N Swift tests (Swift Testing). 1 commit. swift build and swift test green on macOS; not compiled for iOS (no Xcode).`
- **Stop condition.** Any need for a package dependency, XCTest, or a framework other than Foundation.

### A7. `RailKit` API client and token session

- **Model.** sonnet.
- **Files.** New: `Sources/RailKit/Networking/HTTPTransport.swift` (protocol and a `URLSession` implementation), `Networking/RailAPI.swift`, `Auth/TokenStore.swift` (protocol and `InMemoryTokenStore`), `Auth/AuthSession.swift`; `Tests/RailKitTests/Support/FakeTransport.swift`, `Tests/RailKitTests/RailAPITests.swift`, `Tests/RailKitTests/AuthSessionTests.swift`. All paths under `native/RailKit/`.
- **Failing test first** (fake transport and an injected clock; no network).
  - `me()` sends `GET <base>/api/v1/me` with `Authorization: Bearer <token>`, `Accept: application/json`, `X-Rail-Client`, and `X-Rail-Org` only when a bar is selected.
  - A success envelope decodes; an error envelope becomes a typed error carrying code, message, status and request id; an unknown code becomes `.unknown`.
  - A token expiring within 60 seconds is refreshed before the request goes out.
  - A 401 causes exactly one refresh and exactly one retry; a second 401 is returned to the caller.
  - Ten concurrent calls with an expired token cause exactly one refresh request.
  - A refresh that fails clears the store and reports signed-out; the original request is not retried.
  - With no stored session, a call fails as unauthenticated without touching the transport.
- **Acceptance.** SWIFT GATES, then GATES.
- **Log line.** `- **A7 done** (sonnet): RailAPI over an injectable transport, AuthSession with single-flight refresh behind TokenStore, N Swift tests. 1 commit. No Keychain code and no real network call; both wait for Xcode.`
- **Stop condition.** Strict-concurrency errors that cannot be resolved without `@unchecked Sendable` or `nonisolated(unsafe)`: call Opus once, then revert.

### A8. `RailKit` offline count queue (pure)

- **Model.** sonnet.
- **Files.** New: `native/RailKit/Sources/RailKit/Offline/CountQueue.swift`, `native/RailKit/Tests/RailKitTests/CountQueueTests.swift`.
- **Rules to implement.** Architecture file, section 3.5, rules 1 to 3 and 6. A `PendingCount` has `id` (the idempotency key), `userId`, `orgId`, `itemId`, `countedQuantity`, `countedAt`, `baseAsOf`, `note`, and a state: waiting, needs a decision (with the server's current figure), or failed (with the message). `CountQueue` is a Codable value type with no I/O; sending is the caller's job.
- **Failing test first.**
  - `next(for: user, org:)` returns only entries bound to that user and that bar, oldest first. Entries of another user or bar are never returned and never removed.
  - Enqueueing a newer count of the same item by the same user in the same bar replaces their older **waiting** entry; it does not replace one that needs a decision.
  - Outcome `applied` removes the entry. `stale` keeps it and marks it as needing a decision. `retryLater` leaves it untouched. `rejected` keeps it as failed.
  - Only an explicit `discard(id)` removes an entry that was not applied.
  - Encoding and decoding gives back an equal queue.
- **Acceptance.** SWIFT GATES, then GATES.
- **Log line.** `- **A8 done** (sonnet): CountQueue, the client half of the offline count rules, N Swift tests. 1 commit. The server half (the stale-count decision and an idempotency key on stock adjustments) is not built: it needs a migration and the owner's read of section 3.5.`
- **Stop condition.** If the queue seems to need to compute a stock figure (a delta, a new total), stop: the client never computes one.

---

## Do NOT do now

| Not now | Reason |
|---|---|
| The auth routes (`/api/v1/auth/login`, `/refresh`, `/logout`) | They handle passwords and cannot be tested without a real sign-in against the dev project. Contract only, in A4. |
| Any write endpoint; the idempotency-key table; the APNs device table | Migrations. Nothing live, and no schema change without the owner. |
| The server-side stale-count rule, or any change to `adjustStock` | A stock rule and a migration. The owner reads section 3.5 first. |
| Extracting cores from `dashboard/page.tsx`, the sales, payroll and books actions | Touches working money paths and needs each role checked in a browser. This is phase 1 and wants a human watching. |
| An Xcode project, any SwiftUI screen, Keychain or Face ID code | Cannot be built or checked for iOS on this Mac. SwiftUI under the command-line tools is untested. |
| APNs sending code, or any change to `lib/notifications/deliver.ts` | No key exists, and no push is allowed. |
| Changing an RLS policy (narrowing the memberships policy, role-aware write policies) | Live schema. Recorded as R0 and R6 for the owner. |
| Changing the `proxy.ts` matcher to skip `/api/v1` | It is the auth gate. An unmeasured optimisation is not a reason to edit it. |
| `swift-openapi-generator`, the Supabase Swift SDK, any npm package | Decided against for 1.0 (Decision 3). |
| A React Native or Capacitor trial | Decided against (Decision 1). |
| An account-deletion endpoint | It deletes users, and what must be retained is a question for counsel. |
| Stripe, billing, or a packages table | Owner facts (prices, packages). Decided in the rebuild spec as "built later". |
| Rebuilding the web navigation | Still deferred from last night to a human and a watched browser. |
| Widgets, Live Activities, barcode scanning, invoice photos | After 1.0. |
| Editing `AGENTS.md` | Worth a short "API v1" paragraph once A5 has been exercised with a real token, not before. |

## Owner-only steps, in order

1. **Confirm R0 on the live project** (read-only, in the Supabase SQL editor):
   ```sql
   select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr
   from pg_policy where polrelid = 'public.memberships'::regclass;

   select organization_id, count(*) from memberships group by 1 having count(*) > 1;
   ```
   If the first shows the org-wide read policy and the second returns rows, people in those bars other than the first member have probably been acting as owner. Review commit 2 of A1 before any deploy.
2. **Decide the legal entity** that will be the seller, and get its **D-U-N-S number**. Apple wants a legal entity (not a trade name), a public website on the organisation's own domain and an email address on that domain. Enrol as an organisation, not as an individual (guideline 5.1.1(ix)).
3. **Enrol in the Apple Developer Program** (99 USD a year as read today).
4. **Install Xcode**, at least the version Apple's upcoming-requirements page demands on the day (Xcode 26 or later as read on 2026-11-25).
5. **Choose the bundle id** (reverse-DNS of a domain you control) and **the app name** (check that it is free), then register the App ID with Push Notifications.
6. **Create the Xcode project** (multiplatform app template) at `native/RailApp/`, add `native/RailKit` as a local package, set the team and automatic signing, iOS 17 and macOS 14 unless you choose otherwise. From here an agent can write screens, with you running them.
7. **Create the APNs authentication key** and put it in Vercel's environment, never in the repo.
8. **Supabase:** confirm the access-token lifetime and refresh-token rotation settings; make a dev account for each role (owner, manager, accountant, staff) so the endpoints can be tested with real tokens.
9. **App Store Connect:** the app record; privacy policy URL and support URL; the privacy answers; the age rating questions; review notes stating that Rail is sold directly to businesses for their staff and has no purchase in the app; **a standing reviewer bar** with an owner login and a staff login that is not a `/api/demo` bar (those are swept by age).
10. **TestFlight:** internal testers first (up to 100). External testers need the first build approved by TestFlight review.
11. **Pricing and where it is sold:** on the web. No price ever appears in the app.
12. **Counsel:** what must be retained when an account is deleted; whether relying on guideline 3.1.3(c) is comfortable for a public self-serve checkout.
13. **Apply the write-phase migrations** to dev, then live, when that phase starts (not written yet).

## Open questions for the owner

| # | Question | Default taken |
|---|---|---|
| 1 | What share of your staff carry Android phones? | Staff on Android stay on the web portal. |
| 2 | Is a United States storefront only launch acceptable? | Yes. |
| 3 | Oldest iPhone you need to support? | iOS 17. |
| 4 | Should staff be able to join with the bar's code inside the app? | No in 1.0; joining stays on the web. |
| 5 | May a push show pay or sales amounts on a lock screen? | Same text as the in-app alert, as the web does today. |
| 6 | The offline count rule: once stock has moved since the count, a person decides; nothing is applied silently. Agreed? | Yes. |
| 7 | Mac: Mac App Store, or a direct download? | Mac App Store, same listing if Apple allows it (unverified). |
| 8 | After A1, managers and accountants get exactly their own role. Has anyone been relying on more? | Fix regardless. |
| 9 | The approval rules on Payroll Review (last night's morning item 4). | Approval stays off the device until you decide. |
