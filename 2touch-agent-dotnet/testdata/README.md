# Test harness — fake 2Touch DB → agent → Rail

Lets you exercise the whole ingest path without a real 2TouchPOS install:
a local SQL Server database shaped like 2Touch, seeded with realistic bar
traffic, read by the real agent exe.

> **The agent does not run on Vercel.** It runs on the POS box (or your dev
> machine) and pushes *outbound* to Vercel. Vercel never reaches back into the
> bar's network — that's the whole point of the design. The cron in
> `vercel.json` is the unrelated *email* ingest path.
>
> ```
> your machine                          Vercel
> ├── SQL Server (TwoTouchTest)  ←── agent reads over shared memory
> └── rail-2touch-agent.exe ────────→ POST /api/2touch/ingest → Supabase
> ```

## Files

| File | Purpose |
|---|---|
| `01-create-test-db.sql` | Creates `TwoTouchTest` + the three views the agent reads |
| `02-seed-test-data.sql` | Seeds N days of deterministic sales/shift/item data |
| `03-create-test-org.sql` | Creates an isolated Supabase org + agent token (+ teardown) |
| `04-create-unlike-schema.sql` | Creates `TwoTouchOdd` — the same data under names the scorer has never seen |
| `05-create-twotouch-schema.sql` | Creates `TwoTouchLocal` — a faithful copy of the **real** 2TouchPOS schema |
| `mock-ingest-server.js` | Local stand-in for the ingest route — verifies HMAC, writes nothing |

## Stage 1 — local SQL

```powershell
$sqlcmd = "C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\sqlcmd.exe"
cd 2touch-agent-dotnet\testdata
& $sqlcmd -S "lpc:(local)" -E -b -i 01-create-test-db.sql
& $sqlcmd -S "lpc:(local)" -d TwoTouchTest -E -b -i 02-seed-test-data.sql
```

Change the window by editing `@Days` at the top of the seed script. Re-running
it wipes and regenerates — values are derived from each date, so a re-seed
reproduces identical numbers.

**Auth note:** this instance is Windows-auth-only, so `01` skips the
`BarAppRead` login and the config below uses `"User": ""` (Integrated auth).
Production uses a SQL login. To test that path instead, switch the instance to
mixed mode and re-run `01`:

```powershell
# elevated — requires a SQL Server service restart
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQLServer" LoginMode 2
Restart-Service MSSQLSERVER -Force
```

Then set `"User": "BarAppRead"`, `"Password": "TestP@ss123!"`.

## Stage 2 — dry run (nothing leaves the machine)

`appsettings.local.json` (gitignored, sits next to the exe):

```json
{
  "Agent": {
    "Sql":  { "Server": "(local)", "Database": "TwoTouchTest", "User": "", "Protocol": "lpc:" },
    "Rail": { "ApiBaseUrl": "http://localhost:3999",
              "OrgId": "00000000-0000-0000-0000-000000000000",
              "AuthToken": "test-agent-token-do-not-use-in-production" },
    "Sync": { "LookbackDays": 14 }
  }
}
```

```powershell
cd ..\bin\Release\net9.0\win-x64\publish
.\rail-2touch-agent.exe --test --days 14      # query only, send nothing
```

Then verify signing against a local mock of the route:

```powershell
node ..\..\..\..\..\testdata\mock-ingest-server.js   # terminal 1
.\rail-2touch-agent.exe --once --days 14             # terminal 2
```

This is worth doing before touching a real org: it proves .NET's
`System.Text.Json` output verifies against Node's `createHmac`. The two
serializers format numbers differently (.NET emits `188.6` where the seed
stored `188.60`), which is exactly why both sides sign the **raw body bytes**
rather than a re-serialized copy.

## Stage 3 — against Vercel

**1. Make an isolated org.** Run `03-create-test-org.sql` in the Supabase SQL
editor and copy the `OrgId` / `AuthToken` it returns.

Do not reuse your real bar's org. The ingest route auto-creates employees,
inventory items, and categories in the target org
([route.ts:159-168](../../app/api/2touch/ingest/route.ts#L159-L168)), so a test
run would inject fake staff and sales into live payroll and inventory. The
teardown at the bottom of `03` cascades the whole thing away when you're done.

**2. Point the agent at production:**

```json
"Rail": {
  "ApiBaseUrl": "https://bar-app-drab.vercel.app",
  "OrgId":      "<from step 1>",
  "AuthToken":  "<from step 1>"
}
```

**3. Send one sync:**

```powershell
.\rail-2touch-agent.exe --once --days 14
```

Expect `Rail ingest OK: {"zReports":14,"ewReports":56,"itemAudit":11,"errors":[]}`
in about 3 seconds.

The agent logs `Audit:154` while the server reports `itemAudit:11` — not a
mismatch. The agent counts item-audit *rows* (11 menu items × 14 days), and the
route counts the distinct items it wrote to the catalogue. `inventory_items` is
a list of what the bar sells, not a per-day sales log.

**4. Confirm the writes landed** — in the Supabase SQL editor:

```sql
SELECT report_date, total_sales, cc_tips, cash_tips
FROM z_report_days
WHERE organization_id = '<OrgId>'
ORDER BY report_date DESC;
```

If you added the membership from `03`, the data also shows up in the app
dashboard and payroll tabs.

### Vercel prerequisites

The ingest route uses the Supabase **admin** client, so the deployment needs
`SUPABASE_SERVICE_ROLE_KEY` (plus `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`) in Project → Settings → Environment Variables.
`TWOTOUCH_INGEST_SECRET` is only the legacy fallback for orgs with no
`agent_token`; per-org tokens don't need it.

### Troubleshooting

| Symptom | Cause |
|---|---|
| `401 Unauthorized` | `OrgId` has no matching org with `pos_provider = '2touch'`, or `AuthToken` ≠ stored `agent_token` |
| `400 org_id required` | `OrgId` still the `REPLACE_WITH_…` placeholder |
| `Login failed for user 'BarAppRead'` | Instance is Windows-auth-only — use `"User": ""` |
| `errors: ["z_report_days: …"]` | Reached Supabase but a write failed — usually a missing migration |

## Stage 4 — schema discovery

`TwoTouchTest` cannot test discovery. Its relations *are* the configured
defaults — `vwZReport`, `BusinessDate`, `NetSales` — so the scorer would be
graded on recognising the answer it was written from. `04` exists for this:

```powershell
& $sqlcmd -S "lpc:(local)" -E -b -i 04-create-unlike-schema.sql
```

It creates `TwoTouchOdd`, holding the same figures as `tblDayClose`,
`EmpWorkSummary` and `ItemSalesAudit` with column names to match, plus three
decoy relations that share keywords with a feed but cannot supply it.

With that database present, the integration tests in `RailAgent.Tests` run
instead of skipping:

```powershell
cd ..
dotnet test
```

They assert that discovery ranks all three real relations first and proposes
every column correctly with **no operator override** — which is the only
evidence that the scorer generalises.

To watch the wizard do it by hand, run the exe, pair against the test org from
`03`, and pick `TwoTouchOdd` at stage 5.

## Stage 5 — the real schema

`01` and `04` are both inventions. `05` is not: every table and column in it is
copied name-for-name and type-for-type out of a production TwoTouch database.

```powershell
& $sqlcmd -S "lpc:(local)" -E -b -i 05-create-twotouch-schema.sql
```

It recreates the fourteen relations the Rail profile touches and seeds three
business days of deliberately round numbers, so the tests can assert exact
totals rather than "some rows came back":

| Feed | Per day |
|---|---|
| Z Report | net sales `350.00`, cc tips `30.00`, cash tips `7.00` |
| EW Report | 2 employees, `8.00` regular + `1.50` overtime, `400` sales, `40` tips |
| Item Audit | 4 items, qty `10`, net `60.00` each |

It also seeds three rows that must **not** appear: a `blnDeleted` clock row, a
`szRefundFlg='N'` sale line, and a modifier line with a null `fkItemID`.

With `TwoTouchLocal` present, `dotnet test` exercises the built-in mapping
end-to-end through `SqlReader` instead of skipping.

To drive the whole path — profile → derived-table SQL → HMAC → ingest — point
the config at `TwoTouchLocal` and replay stage 2 against the mock server:

```powershell
node mock-ingest-server.js                    # terminal 1
.\rail-2touch-agent.exe --once --days 30      # terminal 2, elevated
```

Expect `Rail ingest OK: {"zReports":3,"ewReports":6,"itemAudit":12,"errors":[]}`
and `✓ HMAC verified` on the server. Those three counts are the seed, so a
mapping that double-counts a join shows up as a wrong number rather than as a
plausible-looking success.

**What this database demonstrates**, and `01`/`04` cannot:

- Hungarian notation everywhere — `fNetAmt`, `dtmClaimDate`, `szDescription`.
- The Item Audit item name and category are `INT` foreign keys; the names are
  in `tblItem` / `tblCategory` and the amount is in a separate `RptCtg` table.
- The EW Report employee is two joins from the hours, via `tblUserJobs`.
- The cash/credit tip split is per payment row, by `lPaymentType`.

The last three are why `Setup/TwoTouchProfile.cs` exists: one-relation discovery
cannot reach any of them.

## Cleanup

```powershell
& $sqlcmd -S "lpc:(local)" -E -Q "DROP DATABASE TwoTouchTest;"
& $sqlcmd -S "lpc:(local)" -E -Q "DROP DATABASE TwoTouchOdd;"
& $sqlcmd -S "lpc:(local)" -E -Q "DROP DATABASE TwoTouchLocal;"
```

Plus the `DELETE FROM organizations …` teardown at the bottom of `03`.
