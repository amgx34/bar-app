# Rail ↔ 2TouchPOS Agent (.NET)

A single self-contained Windows Service that reads the local TwoTouch SQL Server
over **shared memory** and pushes Z Reports, EW Reports, and Item Audit to Rail.

**Why .NET / shared memory:** 2Touch's SQL Server uses a **dynamic TCP port** that
changes on restart. Instead of chasing that port (SQL Browser lookups, registry
reads, forcing port 1433), a local shared-memory connection has **no port and needs
no SQL Server Browser** — the dynamic-port problem simply doesn't exist. The agent
also ships as one `.exe` with the runtime baked in, so the POS box needs **no Node,
no .NET install** — just copy and run.

```
2Touch POS box (Windows)
├── SQL Server (TwoTouch)      ← agent connects via shared memory (lpc:), read-only
├── rail-2touch-agent.exe      ← Windows Service, syncs every 5 min
│     └── SELECT (3 report queries)
│     └── POST + per-org HMAC ─────────────────────────────────────┐
└──────────────────────────────────────────────────────────────── │
                                                                   ▼
                                            <ApiBaseUrl>/api/2touch/ingest → Supabase
```

## Setup

Three steps, one of which happens on the build machine.

**1. Publish** (build machine — needs .NET SDK 9):

```powershell
cd 2touch-agent-dotnet
dotnet publish RailAgent.csproj -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
```

**2. Copy one file to the POS box** — `rail-2touch-agent.exe` from
`bin\Release\net9.0-windows\win-x64\publish\`, anywhere you like. There is no
second file: `appsettings.json` is embedded in the exe. The box needs nothing
else installed (no Node, no .NET; TCP/IP and SQL Browser can stay off).

**3. Double-click it.** The setup wizard runs, prompts for elevation, and walks
twelve stages: pair with Rail, find SQL Server, grant read access, discover the
schema, preview the data, install the service, and send one real sync so you
watch the data land before you leave the site.

The only thing you need in hand is the **pairing code** from
Rail → Settings → POS Integration → 2TouchPOS → *Copy pairing code*. It is one
line beginning `RAIL1-` and carries the org id, that bar's unique token, and the
Rail URL — so nothing is hand-typed.

The wizard installs to `C:\rail-agent\` and writes `appsettings.local.json`
there, readable by Administrators and SYSTEM only.

**Re-running setup is the supported way to fix a bad schema mapping.** It stops
the service, rewrites config, and restarts — no uninstall needed.

### Schema mapping (stage 7)

Two paths, in this order.

**Recognised schema.** If the database looks like a standard TwoTouch install,
the wizard offers a built-in mapping and you press Enter. This is the normal
case and it exists because generic discovery *cannot* do the job on a real box:

| Feed | Where the values actually live |
|---|---|
| Z Report | net sales per ticket in `tblSalesHdrHist`; the cash/credit tip split per payment in `tblSalesHistPmnts` (`lPaymentType` 0 / 2 / 7); plus the `tblSalesDaily*` pair for the un-Z'd day |
| EW Report | hours in `tblTimeClockNew`, employee two joins away via `tblUserJobs` → `tblUser`, sales and tips in `tblTips` |
| Item Audit | line and quantity in `tblSalesHist`, but the item and category are `INT` keys into `tblItem` / `tblCategory`, and the amount is in `tblSalesHistRptCtg` joined on `uKeyID` |

Four relations each. A mapping that names one table and its columns can only
express the Z Report, and only approximately. So the profile writes a **derived
table** — a full `SELECT` with its joins — into `Tables.*`, and the column
aliases into `Columns.*`. `FROM` accepts that as readily as a table name, so
nothing else in the agent changes, no views are created in the bar's database,
and nothing beyond `db_datareader` is needed. See `Setup/TwoTouchProfile.cs`.

**Discovery.** For anything the profile does not recognise or does not cover,
stage 7 enumerates every table and view, scores each against what the feed needs
(a date, net sales, tips…), and shows the top five with a proposed column per
field. You accept, override a single column, or skip the feed. A column matched
on data type alone is flagged `← guess: name gives no clue, check this`.

Either way the mapping is proved with a `TOP 5` run of the real query before
anything is written.

A feed you skip is left out of config, and the service sends an empty array for
it rather than failing a query it could never run.

Stage 12 prints the confirmed mapping as JSON. Paste it into the repo issue for
that bar — real findings become seed synonyms in `Setup/FeedSpecs.cs`.

### Other invocations

```powershell
.\rail-2touch-agent.exe --setup       # the wizard, explicitly
.\rail-2touch-agent.exe --test        # connect + query, print samples, send nothing
.\rail-2touch-agent.exe --once        # one real sync, then exit
.\rail-2touch-agent.exe --run         # foreground loop, for debugging
.\rail-2touch-agent.exe --uninstall   # stop and remove the service, keep config
.\rail-2touch-agent.exe --days 7 --test   # override the lookback window
```

All but `--setup` read `appsettings.local.json`, which is ACL'd to
Administrators and SYSTEM — so **run them from an elevated prompt**. An ordinary
prompt fails at startup with an access-denied reading the config, which looks
like a config problem and is not one.

The service runs on start, then every 5 min; auto-restarts on crash; logs to the
Windows Event Log (source `Rail2TouchSync`).

### Configuration layering

Lowest priority first:

1. `appsettings.json` embedded in the exe — the defaults
2. `appsettings.json` on disk next to the exe — optional override
3. `appsettings.local.json` — what the wizard writes

Hand-editing `appsettings.local.json` still works:

- **Named SQL instance?** `"Server": ".\\SQLEXPRESS"` (double backslash in JSON).
- **Windows auth?** `"User": ""`. The wizard chooses this whenever it can, and
  runs the service as `LocalSystem` with `NT AUTHORITY\SYSTEM` granted
  `db_datareader` — no password is stored anywhere.
- **Different schema?** Override `Tables.*` / `Columns.*`. Bracket-quote
  identifiers, as discovery does: `"[dbo].[vwZReport]"`. A `Tables.*` entry may
  also be a derived table — `"(SELECT … JOIN …) AS src"` — in which case
  `Columns.*` name its aliases. Use `{cutoff}` inside it to filter on a raw
  indexed date column; the agent substitutes the lookback date before running.
- **Skip a feed?** Set its `Tables.*` entry to `""`.

## Tests

```powershell
cd 2touch-agent-dotnet
dotnet test
```

Unit tests cover the pairing code, the schema scorer, the config writer, and
feed skipping. The SQL Server integration tests skip themselves unless
`testdata/04-create-unlike-schema.sql` (discovery on unfamiliar names) and
`testdata/05-create-twotouch-schema.sql` (the built-in mapping against a
faithful copy of the real schema) have been run — see `testdata/README.md`.

## What gets synced

| Query      | → Rail table                          | Powers                   |
|------------|---------------------------------------|--------------------------|
| Z Report   | `z_report_days`                       | Dashboard, Books revenue |
| EW Report  | `employee_shifts`, `z_report_server_tips` | Payroll, per-server tips |
| Item Audit | `inventory_items`, `inventory_categories` | Inventory, analytics     |

## Security

- **Read-only:** the agent only issues `SELECT`, as `NT AUTHORITY\SYSTEM` or the
  `BarAppRead` login, each granted nothing beyond `db_datareader`.
- **No inbound ports:** the box only makes outbound HTTPS to Rail. SQL is never
  exposed to the network (shared memory is in-process IPC).
- **Per-org HMAC:** each request is signed HMAC-SHA256 over the exact request body,
  keyed by that bar's unique agent token — no shared secret across bars.
