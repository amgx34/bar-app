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

Expect `Rail ingest OK: {"zReports":14,"ewReports":56,"itemAudit":154,"errors":[]}`.

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

## Cleanup

```powershell
& $sqlcmd -S "lpc:(local)" -E -Q "DROP DATABASE TwoTouchTest;"
```

Plus the `DELETE FROM organizations …` teardown at the bottom of `03`.
