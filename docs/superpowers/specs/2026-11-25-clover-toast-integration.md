# Clover and Toast as full POS sources

Status: design. Date: 2026-11-25. Branch: rebuild/foundation at f76e4d1.

Goal: Clover and Toast bars get everything a 2Touch bar gets (nightly Z totals, tips, cash/card split, per-item sales that deplete stock, hourly and per-server trade, employees and shifts where the API gives them), through the same write path, so every guard in AGENTS.md applies to all three by construction.

## 1. Decisions

1. **One normalized payload, one applier.** The 2Touch ingest route body (lines 312-837) is one inline handler. It moves into `lib/pos/ingest.ts` as `applyNormalized(admin, orgId, payload, ctx)`. The 2Touch route keeps only auth, version recording, the call, and the outcome write. Adapters never touch Supabase tables; they return a `NormalizedPayload`.
2. **Adapters only fetch and map.** `lib/pos/providers/<name>/` holds a client, a pure mapper, and an adapter implementing `PosAdapter`. Mappers are pure and tested with recorded fixtures.
3. **Pull, not push.** Neither Clover nor Toast has an agent. Rail pulls. The pull runs from a shared `runProviderSync(orgId, opts)` that is called by the daily cron, a "Sync now" server action, an on-view stale refresh, and (Clover, optional) a webhook.
4. **Credentials live in a new service-role-only table, `pos_credentials`, encrypted with `lib/direct-deposit/crypto.ts` (`encryptJSON`/`decryptJSON`, AES key `DD_ENCRYPTION_KEY`).** Not in `pos_config`: `lib/org.ts:144` selects `pos_config` into every membership row, so today a Clover token already reaches every server component that loads an org. Clover's single-use refresh token also needs compare-and-swap, which a JSON blob cannot give without a lost-update hazard (the same class as the `agent_version` bug in AGENTS.md).
5. **Non-secret settings stay in `pos_config`** (merchant id, restaurant guid, region, timezone, cutoff hour, last_sync_*), written only through `lib/pos/pos-config.ts` builders.
6. **Cents are integers until the last step.** Clover sends integer cents. Toast order amounts are decimal dollars in the docs (the existing `lib/toast/client.ts` header says cents, which contradicts them; see section 11). Adapters convert to integer cents with one helper, `toCents(n)` in `lib/pos/money.ts`, sum as integers, and emit dollars with `centsToDollars(c)` (`Number((c / 100).toFixed(2))`). Never `x / 100` on a running float sum.

## 2. The normalized payload

`lib/pos/normalized.ts` exports the type, generalized from the 2Touch body. Shapes are unchanged except where noted.

```ts
type NormalizedPayload = {
  source: string;                    // 'rail-2touch-agent/1.4.0' | 'clover-api' | 'toast-api'
  pulledAt: string;
  zReports: { report_date; total_sales; cc_tips; cash_tips?: number; cash_sales?: number; card_sales?: number }[];
  ewReports: { shift_date; employee_name; total_sales; tips_paid_out; regular_hours; overtime_hours }[];
  itemAudit: { sale_date; item_name; category_name; qty_sold; net_sales }[];
  hourlySales?: { business_date; hour; net_sales; ticket_count; tips }[];
  serverSales?: { business_date; server_name; net_sales; ticket_count; tips }[];
  errors?: string[];                 // 2Touch: agentErrors
  backfill?: boolean;
};
```

Two changes from 2Touch, both additive:

- `cash_tips` becomes optional. Absent means "provider does not report it": the applier omits the column from the upsert so an existing figure is untouched, exactly as `syncCloverSales` does today. Present means it is written under the existing manual guard. 2Touch always sends a number, so its behavior does not change.
- `errors` replaces `agentErrors` inside the core. The 2Touch route maps `agentErrors` onto it and keeps the `agent: ` prefix. API adapters use `api: `. Step 1 checks whether `assessSyncHealth` reads the prefix.

`absent` always means "cannot say". An adapter that failed a feed leaves that array undefined (optional feeds) or empty plus an `errors` entry (required feeds), never a silent empty. A feed that succeeded and found nothing returns `[]`. This is what keeps `no-data` honest.

## 3. The shared applier

`lib/pos/ingest.ts`: `applyNormalized(admin, orgId, payload, ctx: { posConfig, backfill }) => { errors: string[]; summary: SyncSummary }`.

Moved verbatim, in this order, from the route: Z feed with the `cash_tips_source='manual'` guard; EW feed with `partitionShifts` and `hours_source='manual'`; item audit (exclusions first, bundles, size tokens, categories, base-item upsert with `ignoreDuplicates`, `resolveSales`, `pos_item_sales` upsert, per-date `pos_apply_item_sales`); hourly and server replace-by-night; error truncation (5 strings, 300 chars).

It does not write `pos_config`. The caller does, with the existing chain: `recordAgentVersion` (2Touch only) then `recordSyncOutcome`, each taking the latest config and returning what it wrote. `recordSyncOutcome` is skipped when `backfill` is true.

**Pin before moving.** `app/api/2touch/ingest/route.characterization.test.ts` runs the real `POST` against a recording fake of the admin client and a signed fixture body, and asserts the exact ordered list of `(table, operation, filter, payload)` calls plus the RPC arguments, for: a full payload; a manual-cash-tips night; a manual-hours shift; an excluded item; a bundle sale; a backfill payload; a payload with only z/ew/items (old agent); a failing hourly delete. These go green against the unmodified route first, are committed, and are never edited during the extraction. If a diff appears, the refactor is wrong, not the test.

## 4. Credentials, tokens, refresh

### Table (migration `supabase/migrations/20261125000000_pos_credentials.sql`)

```sql
create table if not exists pos_credentials (
  organization_id uuid primary key references organizations(id) on delete cascade,
  provider        text not null check (provider in ('clover','toast')),
  external_id     text not null,            -- clover merchant_id | toast restaurant guid
  secrets         text not null,            -- encryptJSON(...) ciphertext
  version         integer not null default 1,
  sync_lease_until timestamptz,
  updated_at      timestamptz not null default now()
);
create index if not exists ix_pos_credentials_external on pos_credentials(provider, external_id);
alter table pos_credentials enable row level security;  -- no policies: service role only
```

No client ever reads it. All access is in `lib/pos/credentials.ts` through `createAdminClient()`, every query `.eq('organization_id', org.id)`. The webhook lookup by `external_id` is the one cross-org read and carries an `admin-scope-ok` comment saying it is the routing step and the org id is then used for everything after.

### Works before the migration is applied

`loadCredentials` selects from `pos_credentials`; on a "relation does not exist" error it falls back to `pos_config.credentials_enc` (same ciphertext format) and `saveCredentials` writes to wherever it read from, through the `pos-config.ts` builder. Existing Clover orgs with a plaintext `pos_config.access_token` are read as-is, then re-encrypted into the store on first sync and the plaintext key is removed in the same builder write. Without the table, refresh has no CAS, so the fallback path serializes with a short lease in `pos_config` and logs a warning; this is stated as degraded, not equivalent.

### Clover (OAuth v2, expiring tokens)

Secrets: `{ access_token, access_token_expiration, refresh_token, refresh_token_expiration }`. The callback stops dropping them (today it overwrites the whole `pos_config` with two fields and deletes v2's expiry). The v1 non-expiring fallback is deleted: Clover has made v2 mandatory.

Refresh, in `lib/pos/providers/clover/auth.ts`: before any call, if the access token expires within 5 minutes, take the lease, `POST {api}/oauth/v2/refresh {client_id, refresh_token}`, then write the new pair with `update ... where organization_id = $1 and version = $old` and bump `version`. Zero rows updated means another worker refreshed first: reload and use theirs. The new pair is persisted before the response is used. On 401 mid-run, refresh once and retry once. Refresh tokens are single use, so a crash between response and write strands the connection; the adapter detects `X-Clover-Recovery-Available`, records `needs-reauth` in `pos_config`, and the UI shows "Reconnect Clover". Using `/oauth/v2/recovery` is deferred until its format can be tested in sandbox.

State is signed: `state = orgId.nonce.exp.hmac`, HMAC-SHA256 with a new `OAUTH_STATE_SECRET`, nonce also set in an httpOnly cookie and compared in the callback, 10 minute expiry. Today the state is the bare org id. Region (`na`, `eu`, `la`, `sandbox`) is chosen on the setup page, stored as `pos_config.clover_region`, and picks both hosts.

### Toast (client credentials)

Secrets: `{ client_id, client_secret, access_token?, token_expires_at? }`. The bar owner pastes client id, secret and restaurant guid from Toast Web (Integrations, Toast API access). No partner agreement is needed for standard read-only access, which is the supported route (section 11 lists the cost and approval unknowns).

There is no refresh. Login only when the cached token is within 5 minutes of expiry, under the lease, and persist the new token with the same version CAS. Toast limits logins to about twice an hour per IP, and Vercel egress IPs are shared, so a login storm across orgs could be throttled. The DB-cached token and one login per org per day make that unlikely; a 429 or lockout is recorded as an error, not retried in a loop.

## 5. Scheduling and freshness

Vercel Hobby allows one daily cron, `/api/cron/2touch`. Honest position: **API providers are daily plus on demand, not every five minutes.**

- **Daily cron.** After the existing 2Touch email work, `runDailyProviderSync()` loops orgs with `pos_provider in ('clover','toast')` and a credentials row, sequentially, with a time budget (stop at 50 seconds of a 60 second `maxDuration`, resume next run; the lookback makes skipped orgs catch up). Each org is wrapped in its own try so one failure cannot cost another bar its night. Lookback is 3 business dates, which also repairs a missed day.
- **Sync now.** A server action on the settings POS panel and the dashboard strip, owner or manager. Lookback 3 days. Rate limited by the lease: refused with "synced N minutes ago" if `last_sync_at` is under 2 minutes old.
- **Stale on view.** The dashboard layout, via `after()`, calls `runProviderSync` when `last_sync_at` is older than 30 minutes and no lease is held. This is what gives a Clover or Toast bar near-live numbers without a second cron. Cost: one sync per 30 minutes of active use, bounded by the lease.
- **Clover webhook (optional, step 4).** `POST /api/clover/webhook`. Auth is the static `X-Clover-Auth` shared key compared with `timingSafeEqual` against `CLOVER_WEBHOOK_KEY`; the verification-code handshake returns 200. Payloads are ids only, so an event just marks the org dirty and triggers a sync of today through `after()`. Treated as a hint: the cron and on-view paths do not depend on it. It needs an approved Clover app, so it ships behind the env var being set. Toast has no webhook available at standard access.
- **Idempotency.** Safe to run any number of times concurrently-ish: Z is an upsert on `(organization_id, report_date)`; hourly and server feeds replace a night; items apply by delta against `pos_stock_applications`. The lease stops two runs from interleaving `pos_config` writes.
- **Lease.** `pos_credentials.sync_lease_until`, taken with `update ... set sync_lease_until = now()+interval '90 seconds' where organization_id=$1 and (sync_lease_until is null or sync_lease_until < now())`. No row updated means skip, which is reported to the caller as "already running".

## 6. Business date and hour

The applier trusts `YYYY-MM-DD` as the 2Touch route does; each adapter owns the derivation. `lib/pos/business-date.ts` is pure and tested: `businessDateOf(instantMs, timeZone, cutoffHour) => 'YYYY-MM-DD'` and `localHour(instantMs, timeZone) => 0..23`, using `Intl.DateTimeFormat` with the zone, shifting by the cutoff before taking the date. Tests cover 1:59 and 4:00 either side of the cutoff, a spring-forward night, and a fall-back night (the repeated hour sums into one hourly row, which `normaliseHourlyRows` already does).

- **Toast.** Order and payment `businessDate` come from Toast and are used directly. `closeoutHour` and `timeZone` are read once from the restaurants endpoint at connect time and stored in `pos_config` (`toast_closeout_hour`, `timezone`); they are used only for the hour-of-day of hourly rows. Never assume 4.
- **Clover.** No business day exists in the API. Setup asks for the cutoff hour (default 4, range 0 to 12, as the agent clamps) and reads the timezone from the merchant record. Stored as `pos_config.cutoff_hour` and `pos_config.timezone`. If the timezone cannot be read the connection is not marked ready; guessing UTC would shift every night.
- **Attribution rule, both providers.** A sale belongs to the business date it was paid on; a refund or void belongs to the date it happened (Toast's `refundBusinessDate`, Clover refund `createdTime`). Late refunds therefore reduce a later night rather than rewriting history, which matches how a drawer is counted.

## 7. Field mapping

| Normalized | Clover | Toast |
|---|---|---|
| `total_sales` (net, excludes tax and tip) | sum over SUCCESS payments of `amount - taxAmount` (minus refunds `amount - taxAmount - tipAmount`). Test-mode orders excluded. | Toast net sales procedure: non-voided, non-deleted checks, `check.amount` (after discounts and service charges, excludes tax and tip), less refunds on the refund date. `createdInTestMode` excluded. |
| `cc_tips` | sum of `tipAmount` on non-cash SUCCESS payments, minus refund `tipAmount` | sum of `tipAmount` on CREDIT payments that are not voided, minus `refund.tipRefundAmount` |
| `cash_tips` | omitted (undefined). Clover reports `cashTipsCollected` on shifts, but it is optional and not a Z figure. | sum of `declaredCashTips` from time entries for the business date; omitted if the time entries feed failed |
| `cash_sales` / `card_sales` | split by `tender.labelKey` (`com.clover.tender.cash` vs card). NULL when any payment has an unrecognized tender or the two do not sum to `total_sales`. | `CASH` vs `CREDIT`. NULL when `GIFTCARD`, `HOUSE_ACCOUNT`, `OTHER` or `UNDETERMINED` payments exist or the two do not sum to `total_sales`. |
| `itemAudit` | `lineItems` of non-voided, paid orders; name from the line item; category from the item catalog (`/items?expand=categories`, fetched once per run into a map); `qty_sold` from `unitQty` (null means 1); `net_sales` after line discounts | selections of non-voided checks, modifiers excluded; name and `salesCategory.name` from `menus/v2/menus` via a guid map; `qty_sold` from `quantity`; `net_sales` from `price` (net) |
| `hourlySales` | per payment, `localHour(createdTime)`; `ticket_count` is distinct orders; `tips` the card tips | per payment, `localHour(paidDate)`, same |
| `serverSales` | per `employee.name`, from the payment's employee | per `order.server`, name via the employees map |
| `ewReports` | shifts (`inTime`, `outTime`, `overrideInTime`/`overrideOutTime` win): hours between, business date of `inTime`; `regular_hours` = hours, `overtime_hours` = 0 because Clover has no overtime rule and payroll applies it; open shifts (no `outTime`) skipped | time entries: `regularHours`, `overtimeHours`, `businessDate`; entries with null `outDate` skipped (totals are 0 until clock-out) |
| `tips_paid_out` | 0 | `tipsWithheld` is not a payout; send 0 unless Toast shows a TIP_OUT cash entry for the employee, which needs the cash entries feed and is a stretch goal |

Voided and deleted checks never reach the item feed, so depletion never subtracts what was not sold. Comps and discounts reduce `net_sales`; the depleted quantity is still `qty_sold`, since the drink was poured.

Two traps recorded so the code does not repeat them. Clover's current `syncCloverSales` sums `order.total / 100`, which includes tax and tip and is a float division; it is replaced, not extended. Clover's `unhashedPin` appears on employee records and is never requested or stored: `fields` is narrowed on the employees call and the mapper picks named properties.

## 8. Matching to existing Rail rows

- **Items.** By name, the same as 2Touch: `posItemMatchKey(name)`, exclusions first, `parseVariant` for base items, `ignoreDuplicates` upsert on `(organization_id, name)`. A bar that switches from 2Touch to Clover keeps its inventory because names, not provider ids, are the key. Provider ids (Clover item id, Toast guid) are used only inside one run to look up names.
- **Employees.** By name, lowercase-keyed, creating `tip_mode: 'pool'` rows for unseen names, as the EW block does. Toast employee name is `chosenName` if present, else `firstName lastName`; Clover is `name`. Two people with the same name collapse into one, which is an existing 2Touch limit and is stated rather than solved here. A deleted provider employee (`deletedTime`, `deleted`) with shifts in range is still named; it is not removed from Rail.
- **Server sales** keep `employee_id` unresolved, as `pos_server_sales` does for 2Touch.
- **Switching providers** (`selectPOSProvider`) must not clear `pos_stock_applications` or sales history; only `pos_config` and the credentials row change. Disconnect deletes the credentials row (and zeroes the secrets before deleting where possible) and clears non-secret config.

## 9. Sync health and capabilities

- `lib/pos/sync-health.ts`: the gate at line 155 (`posProvider === '2touch' && cfg.agent_token`) becomes `isConnected(provider, cfg)` which is true for 2Touch with a token, and for Clover or Toast with `cfg.merchant_id` / `cfg.restaurant_guid` and no `needs_reauth`. Staleness thresholds become per provider: 2Touch keeps its current five-minute-cadence numbers (pinned by the existing tests, which are not edited), API providers use a 30-minute on-view target and treat over 36 hours as `stale` and over 72 as `down`, because the cron is daily. A new status, `needs-reauth`, is amber and carries a Reconnect action. `no-data` keeps its meaning and its amber, and an absent `last_sync_summary` still means "cannot say".
- `SyncSummary` is reused as is. The adapters' counts feed `zReports`, `ewReports`, `itemAudit`, `hoursRecorded`, `serversRecorded`, `stockMoved`, `unresolvedItems` through the applier, so `movedNothing` works for them unchanged.
- `sales-capabilities.ts` is keyed on row counts and stays so. Hourly, server and ticket panels light up once the first API sync writes rows, with no provider branch. Only the help copy changes: "connect your POS" wording for Clover and Toast instead of "the Rail agent on the bar PC". A Clover or Toast bar's history before connection has no hourly rows, which the capability check already treats as unavailable rather than zero.
- **Error surfacing.** Each feed has its own try inside the adapter. A failing feed adds `api: <feed>: <message>` to `errors` (5 max, 300 chars), is logged at error level with the org id, and leaves that feed's array undefined. The settings panel shows the last errors. A 401 after refresh, a 403 from a missing scope (the message names the scope when Toast's response does), and a 429 are distinguished because the fixes differ.

## 10. Migrations

1. `20261125000000_pos_credentials.sql`: the table above. Applied by a human; nothing here applies it.
2. No other schema change. Cutoff, timezone, region and ids live in `pos_config`; the applier writes only existing tables. If a later step wants a `pos_sync_runs` history table it is a separate, optional migration.

The app is correct before step 1 of the SQL is applied through the fallback in section 4, and correct after. A test runs `loadCredentials` against a fake that returns a "relation does not exist" error and asserts the fallback.

## 11. What cannot be verified without real credentials

Everything below is from documentation read second-hand, not from a live response. Each is a named check for the first real sandbox or pilot-bar run, and each has a code path that fails visibly rather than guessing.

Clover:
- Token endpoint host (`api.*` vs `www.*`) and request encoding (JSON body vs form) for `/oauth/v2/token` and `/oauth/v2/refresh`; units of `*_expiration`.
- Whether the callback reveals the merchant's region; refresh token lifetime; the `/oauth/v2/recovery` request.
- Whether `payment.amount` includes `taxAmount` (docs say both "order subtotal" and "taxAmount included in amount"); this decides `total_sales`.
- Whether `order.total` includes tax and tip (unused by design); `unitQty` null semantics; the line item and discount field names; the categories expansion shape.
- Page size and offset cap on orders and payments; the 90 day cap on `createdTime` filters; whether a tip adjustment bumps `modifiedTime`.
- Which permissions shifts and cash events need; whether a merchant can install without a Market listing or approval.
- Whether the merchant timezone is on the merchant object.

Toast:
- Whether standard API access is purchasable by a bar today, its price, and the production hostname Toast issues (the existing client hard-codes `ws-api.toasttab.com`; the doc says the host is given to you). The host becomes `TOAST_API_HOST`.
- Whether order amounts are dollars or cents. The docs show decimals; `lib/toast/client.ts` says cents. The mapper uses dollars and a sandbox fixture decides; a sanity check (a Z night whose sum is more than 100 times its item count times a plausible price) logs a warning.
- That `selection.item.guid` equals the menu item `guid` in every case (multi-location menus); the page-until-short stop condition of `ordersBulk`; pagination on payments, labor and cash entries.
- Login behavior under shared Vercel IPs; the exact scope list granted at standard access (`orders:read`, `labor:read`, `menus:read`, `restaurants:read`, `cashmgmt:read` assumed).
- Whether `tipsWithheld` or cash entries represent tip payouts the way 2Touch's `tips_paid_out` does.

Both: whether `cash_sales` + `card_sales` reconcile to `total_sales` on real nights (the reconcile check is the safety net); whether Z `total_sales` should match the POS's own Z printout to the cent. The first pilot bar should compare three printed Z reports against Rail before it is trusted.

Not testable here by design: the cron, the lease under real concurrency, `after()` behavior on Vercel, and Clover's webhook handshake.

## 12. Build plan

Four ordered steps. Each lands green on `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run audit:scope`. Money and stock logic: failing test first, no existing money test edited. Stage files by path only.

### Step 1. Shared core extraction (2Touch unchanged)

1. Characterization first, committed alone: `app/api/2touch/ingest/route.characterization.test.ts`, `app/api/2touch/ingest/__fixtures__/*.json`, and a `lib/test/fake-admin.ts` recording client. Green against the untouched route.
2. `lib/pos/normalized.ts`: payload type and `parseNormalized()` validator (dates via `isIsoDate`, non-negative `total_sales`).
3. `lib/pos/money.ts` + `money.test.ts`: `toCents`, `centsToDollars`, `sumCents`. Tests include 0.1 + 0.2, 19.99 x 3, and values that drift under float.
4. `lib/pos/business-date.ts` + `business-date.test.ts`: cutoff and DST cases above.
5. `lib/pos/ingest.ts`: `applyNormalized`, moved from the route. The `cash_tips` optional behavior added here with its own failing-first test in `lib/pos/ingest.test.ts` (undefined leaves the stored value; manual night is frozen; 2Touch numeric path unchanged).
6. `app/api/2touch/ingest/route.ts`: reduced to auth, `recordAgentVersion`, `applyNormalized`, `recordSyncOutcome`. Characterization suite must pass unmodified.
7. `lib/pos/pos-config.ts`: add `applyProviderSettings(cfg, patch)` and make `applySyncOutcome` provider-neutral, with ordering tests in `pos-config.test.ts` (new cases only).
8. `lib/pos/sync-health.ts` and `sync-health.test.ts`: `isConnected`, per-provider cadence, `needs-reauth` (new tests; existing 2Touch tests untouched).
9. `lib/pos/providers/types.ts` (`PosAdapter`), `lib/pos/sync-run.ts` (`runProviderSync`, lease, outcome write), `lib/pos/credentials.ts` + `credentials.test.ts` (encrypt round trip, CAS conflict, table-missing fallback), `supabase/migrations/20261125000000_pos_credentials.sql`.

Exit: 2Touch behavior pinned and identical; nothing yet calls the new providers.

### Step 2. Clover adapter and auth completion

1. `lib/pos/providers/clover/auth.ts` (+ test): signed state, token exchange, refresh with CAS, host selection by region, recovery detection.
2. `lib/pos/providers/clover/client.ts`: paged GET with the 16 req/s per token budget, 429 backoff from 1 second, `User-Agent`, narrowed `fields`.
3. `lib/pos/providers/clover/map.ts` + `map.test.ts` against `__fixtures__/` (hand-written to the documented shapes, labeled as such): sales net of tax, refunds on their own date, voided and test-mode orders dropped, tender split with NULL fallbacks, hourly across the cutoff, shift hours, exact cents.
4. `lib/pos/providers/clover/adapter.ts`: `fetchNights`, per-feed try, categories map.
5. `app/api/clover/callback/route.ts`: verify signed state and cookie, store the full v2 pair via `saveCredentials`, merge non-secret config with `applyProviderSettings` (no more whole-column overwrite), add the `admin-scope-ok` justification, remove v1 fallback. `app/(app)/setup/pos/clover/page.tsx`: region, cutoff hour, signed state, honest copy.
6. `app/(app)/app/settings/actions.ts`: `syncCloverSales` becomes a thin wrapper over `runProviderSync`; `syncCloverInventory` stops writing `current_stock` (sales now deplete it, so setting it from `stockCount` would double count) and loses the dead `expires_at` guard; disconnect deletes the credentials row.

### Step 3. Toast adapter and connect flow

1. `lib/toast/client.ts` and `types.ts`: rewrite to the researched API (host from `TOAST_API_HOST`, `userAccessType`, cached token, `Toast-Restaurant-External-ID`, ordersBulk paging to a short page, timeEntries, employees, menus, restaurants), dollars not cents.
2. `lib/pos/providers/toast/map.ts` + `map.test.ts` (fixtures hand-written to the docs): net sales procedure, payments by type, refunds on `refundBusinessDate`, selections via the menu map, time entries, cash/card NULL fallbacks, exact cents.
3. `lib/pos/providers/toast/adapter.ts`: modified-window pull to find touched business dates, then full `businessDate` refetch of each, so a refund on an older order is not missed.
4. `app/(app)/setup/pos/toast/page.tsx` and `actions.ts`: owner-only form (client id, secret, guid), verify by login plus restaurant fetch, store secrets and read closeout and timezone, errors that say which of 401, 403 or bad guid.
5. `app/(app)/setup/pos/_components/pos-selector.tsx` and `setup/pos/actions.ts`: Toast option, with the standard-access requirement stated and feature lists matching what ships.

### Step 4. Scheduling, UI, status, docs

1. `lib/pos/providers/registry.ts`, `lib/pos/run-daily-providers.ts`; `app/api/cron/2touch/route.ts` calls it after the email poll, with the time budget and per-org try. `export const maxDuration = 60`.
2. `app/(app)/app/settings/_components/pos-panel.tsx` and `settings/actions.ts`: provider-neutral "Sync now", last sync, last errors, Reconnect, an "Import history" action (lookback up to 90 days; z, hourly and servers on by default; items off by default behind a confirm that says it restates stock, mirroring the agent's `--feeds` rule).
3. `app/(app)/app/dashboard/_components/sync-status-strip.tsx` and the dashboard layout: render for API providers, stale-on-view `after()` trigger.
4. `app/api/clover/webhook/route.ts`: handshake, `X-Clover-Auth` constant-time check, mark dirty, `after()` sync. Inert without `CLOVER_WEBHOOK_KEY`.
5. `lib/pos/sales-capabilities.ts` help copy per provider.
6. Docs: `AGENTS.md` Integrations section (credentials table, lease, cadence, why Clover refresh is CAS, the pull attribution rule), `PRODUCT.md` line 24, `app/privacy/page.tsx` (add Toast, describe stored credentials and what is read), `.env.example` (`OAUTH_STATE_SECRET`, `CLOVER_API_REGION` defaults, `CLOVER_WEBHOOK_KEY`, `TOAST_API_HOST`), and a short operator runbook for the pilot-bar Z comparison from section 11.

Exit: both providers connect, sync daily and on demand, show health on the dashboard, and every unverified item in section 11 has a visible failure mode.

## 13. Out of scope

Clover Export API history past 90 days; Clover `/oauth/v2/recovery`; Toast partner certification and Toast webhooks; writing back to either POS; employee pay rates; resolving duplicate employee names; the 2Touch email poller's missing manual-hours guard (a separate existing gap, noted in the contract research).
