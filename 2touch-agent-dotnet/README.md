# Rail ↔ 2TouchPOS Agent (.NET)

A single self-contained Windows Service that reads the local TwoTouch SQL Server
over **shared memory** and pushes Z Reports, EW Reports, and Item Audit to Rail.

**Why .NET / shared memory:** 2Touch's SQL Server uses a **dynamic TCP port** that
changes on restart. Instead of chasing that port (SQL Browser lookups, registry
reads, forcing port 1433), a local shared-memory connection has **no port and needs
no SQL Server Browser** — the dynamic-port problem simply doesn't exist. The agent
also ships as one `.exe` with the runtime baked in, so the POS box needs **no Node,
no .NET install** — just copy and run.

Shared memory is the *preference*, not an assumption. A production 2Touch box
turned up with Shared Memory disabled in SQL Server Configuration Manager, where
hardcoding `lpc:` produced "server was not found" on a SQL Server that was
running fine. Setup now tries shared memory, then the client default, then named
pipes, and records whichever answers (`SqlProbe.Protocols`).

```
2Touch POS box (Windows)
├── SQL Server (TwoTouch)      ← agent connects via shared memory (lpc:), read-only
├── rail-setup.exe             ← installer / menu / diagnostics
├── rail-update.exe            ← upgrades the agent in place
├── rail-uninstall.exe         ← removes service, config and credentials
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
$flags = @('-c','Release','-r','win-x64','--self-contained',
           '-p:PublishSingleFile=true','-p:IncludeNativeLibrariesForSelfExtract=true')

dotnet publish RailAgent.csproj                        @flags
dotnet publish apps/RailSetup/RailSetup.csproj         @flags
dotnet publish apps/RailUpdate/RailUpdate.csproj       @flags
dotnet publish apps/RailUninstall/RailUninstall.csproj @flags
```

**2. Copy four files to the POS box**, from each project's
`bin\Release\net9.0-windows\win-x64\publish\`, into one folder:

| File | What it is |
|---|---|
| `rail-setup.exe` | run this first — the menu, the wizard, diagnostics |
| `rail-2touch-agent.exe` | the service. The only one that runs continuously |
| `rail-update.exe` | checks Rail for a newer agent and swaps it in |
| `rail-uninstall.exe` | removes the service, the config and the SQL login |

`appsettings.json` is embedded in each exe, so there is no config file to copy.
The box needs nothing else installed (no Node, no .NET; TCP/IP and SQL Browser
can stay off).

Setup copies `rail-update.exe` and `rail-uninstall.exe` into the install
directory alongside the agent, so they survive the download folder being
cleared — and `rail-update.exe` has to sit next to the binary it replaces to
find it.

**Why four executables and not one.** Windows holds a lock on a running image,
so a process cannot overwrite itself — an updater has to be a *different binary*
from the one it replaces. Once that split exists, keeping setup and uninstall
out of the service binary follows: an update then swaps a file that does nothing
but sync, and the uninstaller still works when the rest of the install is broken.

**3. Double-click `rail-setup.exe`.** A menu appears — nothing runs on its own:

```
  Account    BAR-POS\Administrator (Administrator)
  Config     not installed yet
  Service    not installed

    1. Install or re-run setup   (needs Administrator)
    2. Check for updates         (needs Administrator to install)
    3. Run diagnostics           (changes nothing, writes a report)
    4. Remove the service        (needs Administrator, keeps config)
    5. Remove everything         (service, config, and credentials)
    6. Exit
```

Option 1 walks the twelve stages: pair with Rail, find SQL Server, grant read
access, discover the schema, preview the data, install the service, and send one
real sync so you watch the data land before you leave the site.

Option 2 hands off to `rail-update.exe` as a separate process rather than
running the update in-process — a menu hosted inside the binary being replaced
cannot replace it.

Option 3 is the same `--diagnose` report described below, reachable without a
command line — which is the point, since the person holding the mouse at a
broken POS box is the one who needs it.

The three status lines above the menu are re-read each time it redraws, so after
an install it shows the service running. Every entry is also a flag for scripted
use, and `--setup` goes straight in without the menu.

### Unattended install from a USB stick

For a site visit where nobody should be answering prompts, put the executables
on a stick along with `Key.txt` holding that bar's pairing code and
`INSTALL - no keyboard needed.cmd`, then double-click the `.cmd`.

```powershell
.\rail-setup.exe --unattended                       # key file found automatically
.\rail-setup.exe --unattended --pairing-file D:\Key.txt
.\rail-setup.exe --unattended --server ".\SQLEXPRESS" --database TwoTouchProd
```

`Key.txt` is looked for beside the exe first, then on the root of every
removable drive, so running the exe straight off the stick finds it. The file
may contain comments, blank lines and a BOM; the first line starting `RAIL1-`
wins. It is validated **before** elevation, so a bad paste fails in a second
rather than after a UAC prompt and a SQL probe.

Every prompt becomes a rule or a refusal, and it refuses rather than guesses:

| Stage | Unattended |
|---|---|
| 2 Pairing code | From the key file |
| 4 Instance | The only one, or `--server`. Two candidates and no flag stops |
| 5 Database | Exact `TwoTouch`, else a single name containing "2touch", else `--database`. Ambiguity stops |
| 6 Read access | Windows auth only — it cannot type an `sa` password, so a non-sysadmin operator stops |
| 7 Schema | Built-in mapping, accepted automatically. Feeds it does not cover are **skipped and named**, never mapped by guesswork |
| 8 Preview | Installs even with no rows in 7 days, and warns — the mapping already proved itself at stage 7 |

A wrong guess here writes a service that quietly syncs the wrong bar's data,
which is why ambiguity is a hard stop with the flag that resolves it.

**Elevation still prompts.** Windows has no way around UAC, and it has disabled
AutoRun for removable drives since Windows 7 — nothing can launch on insert, so
the double-click is required. The launcher elevates itself first so the
whole install happens in one window; the exe's own relaunch would open a second
console and exit, reporting success before the work had started.

**The key file is a live credential.** Anyone holding the stick can push data
into that bar's Rail account. Use one stick per bar and keep it controlled.

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

### `rail-diagnose.exe` — the checks on their own

A second, separate executable that runs every check and asks nothing. Built from
`tools/RailDiagnose`, which references the agent, so the two can never drift:

```powershell
dotnet publish tools/RailDiagnose/RailDiagnose.csproj -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
```

Double-click it. No flags, no menu, no prompt, no "press Enter" — it runs, writes
`rail-diagnose-<timestamp>.txt` beside itself, and opens that file so the report
survives the console window closing. Exit code 0 when nothing failed.

This is the copy to hand to whoever is physically at the POS box. It installs
nothing and changes nothing, so it is safe to run at any time, including while
setup is stuck.

**It reads the installed configuration, not just its own folder.** It looks for
`appsettings.local.json` beside itself and in `C:\rail-agent`, preferring the
installed copy because that is the one the service actually reads — otherwise a
tool run from a USB stick would report "setup has never run" about a box that is
working perfectly. The report names which file it used.

### When setup goes wrong — `--diagnose`

```powershell
.\rail-setup.exe --diagnose
```

Walks every prerequisite the twelve stages depend on and prints pass / warn /
fail with timings, then writes the same thing to
`rail-diagnose-<timestamp>.txt` next to the exe so it can be emailed off the
POS box. Run it unelevated if you like: checks needing Administrator report
`[WARN]` and say so rather than refusing to produce a report.

**Nothing it does can hang.** That is the point of it — the operator reaches for
it *because* something is hanging, so every step runs under a wall-clock budget
and reports `TIMEOUT` instead of inheriting the stall. The wizard has no such
guarantee: stage 5 opens the process's first `SqlConnection`, and a single-file
exe unpacks `Microsoft.Data.SqlClient.SNI.dll` to `%TEMP%\.net\` at that exact
moment. That happens before any connection logic, so `ConnectTimeoutSeconds`
does not govern it — an on-access antivirus scan of the unsigned native library
stalls the wizard silently for as long as it takes. Section 5 of the report
isolates that: extraction state before, one deliberate first connect, state
after.

It reports on what is **configured**, not on what happens to be available. A
reachable instance that is not the configured one, a database that exists under
a different name, a `Tables.*` entry someone hand-edited — each is a `[FAIL]`,
because the service only ever uses config. Where a stand-in lets the later
checks still say something useful it carries on with one, and says so.

| Section | Answers |
|---|---|
| 1–2 | Elevated? Which of the three config layers loaded, and is each valid JSON? |
| 3 | DNS, TCP, and a real HMAC-signed empty ingest — proves the token matches the org |
| 4 | Registered instances and whether their services are running |
| 5 | Native client extraction, then every instance × `lpc:`/default/`np:` × credentials |
| 6–7 | Login name, sysadmin, Mixed Mode; visible databases |
| 8–9 | Relation count, which feeds the built-in mapping covers, and the feed queries run for real |
| 10 | Row counts and whether the date columns are indexed — the 5-minute sync scans them otherwise |
| 11–12 | Config file readability and ACL; service state and recent Event Log entries |

Exit code is 0 when nothing failed, 1 otherwise.

### Other invocations

```powershell
# rail-setup.exe — install, configure, diagnose
.\rail-setup.exe                    # the menu (same as double-clicking it)
.\rail-setup.exe --setup            # the wizard, straight in, no menu
.\rail-setup.exe --unattended       # the wizard with no prompts, key from a file
.\rail-setup.exe --diagnose         # check every prerequisite, write a transcript

# rail-update.exe — upgrade in place
.\rail-update.exe                   # check, then ask before installing
.\rail-update.exe --check           # report only. Exit 10 = an update is available
.\rail-update.exe --yes             # install without asking (for a Scheduled Task)
.\rail-update.exe --rollback        # put the previous version back

# rail-uninstall.exe — remove
.\rail-uninstall.exe                # service, config and credentials
.\rail-uninstall.exe --keep-config  # only the service
.\rail-uninstall.exe --yes          # skip the confirmation

# rail-2touch-agent.exe — the service itself
.\rail-2touch-agent.exe --test      # connect + query, print samples, send nothing
.\rail-2touch-agent.exe --once      # one real sync, then exit
.\rail-2touch-agent.exe --run       # foreground loop, for debugging
.\rail-2touch-agent.exe --version   # print the installed version
.\rail-2touch-agent.exe --days 7 --test   # override the lookback window
```

The setup, diagnose and uninstall flags used to live on `rail-2touch-agent.exe`.
Passing one of them to the agent now prints the executable that took it over and
exits non-zero rather than doing nothing — a `--uninstall` that silently no-ops
would leave someone believing a decommissioned POS box had been cleaned.

All but `rail-setup.exe --setup` read `appsettings.local.json`, which is ACL'd to
Administrators and SYSTEM — so **run them from an elevated prompt**. An ordinary
prompt fails at startup with an access-denied reading the config, which looks
like a config problem and is not one.

The service runs on start, then every 5 min; auto-restarts on crash; logs to the
Windows Event Log (source `Rail2TouchSync`).

## Releasing an update

The agent reports its version to Rail on every sync (`X-Rail-Agent`), and Rail
shows it under Settings → POS Integration. `rail-update.exe` compares that
against a manifest Rail publishes at `GET /api/agent/manifest`.

**1. Bump the version** in `RailAgent.csproj`:

```xml
<Version>1.1.0</Version>
```

That single number is the whole release declaration — `AgentVersion` reads it
back off the assembly, so nothing else needs editing. Keep it `Major.Minor.Patch`:
the updater parses it with `System.Version` and compares numerically, so `1.10.0`
correctly outranks `1.9.0`.

**2. Publish and hash** the new agent binary:

```powershell
dotnet publish RailAgent.csproj @flags
Get-FileHash bin\Release
et9.0-windows\win-x64\publish
ail-2touch-agent.exe -Algorithm SHA256
```

**3. Host the binary** somewhere publicly downloadable over HTTPS — GitHub
Releases is the obvious choice. It is deliberately *not* served from Rail: a
~70MB self-contained build is the wrong shape for a serverless function.

**4. Set the environment variables** on Vercel and redeploy:

| Variable | Example | Notes |
|---|---|---|
| `AGENT_LATEST_VERSION` | `1.1.0` | must match the csproj exactly |
| `AGENT_DOWNLOAD_URL` | `https://github.com/.../rail-2touch-agent.exe` | must be https |
| `AGENT_SHA256` | `a3f1…` (64 hex chars) | from step 2 |
| `AGENT_RELEASE_NOTES` | `Fixes the 4am business-day boundary.` | optional, shown to the operator |
| `AGENT_MINIMUM_VERSION` | `1.1.0` | optional; below this the update is reported as **required** |

Until all three of the first variables are set the manifest returns `204`, which
every agent reads as "you are current". A malformed one returns `500` rather
than publishing something that would send every box chasing a download it cannot
verify.

**5. Operators run `rail-update.exe`.** It downloads, **verifies the SHA-256
before touching anything**, stops the service, keeps the old binary as
`rail-2touch-agent.exe.bak`, swaps, restarts, and watches the Event Log. If the
new build does not come up cleanly it rolls back automatically. Nothing is
deleted until the replacement has proven it starts.

To automate it, register a Scheduled Task running `rail-update.exe --yes` as
SYSTEM. `--check` exits `10` when an update is available, for monitoring that
should not install anything.

### Rolling back

```powershell
.
ail-update.exe --rollback
```

Restores `rail-2touch-agent.exe.bak` and restarts the service. The backup is the
version that was running before the last successful update.

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

Unit tests cover the pairing code, the schema scorer, the config writer, feed
skipping, and `Diagnostics.Bounded` — the wall-clock budget `--diagnose` relies
on, which cannot be proved through a real connection because SqlClient's own
`ConnectTimeout` fires first and hides whether ours works at all. The SQL Server
integration tests skip themselves unless
`testdata/04-create-unlike-schema.sql` (discovery on unfamiliar names) and
`testdata/05-create-twotouch-schema.sql` (the built-in mapping against a
faithful copy of the real schema) have been run — see `testdata/README.md`.

## What gets synced

| Query      | → Rail table                          | Powers                   |
|------------|---------------------------------------|--------------------------|
| Z Report   | `z_report_days`                       | Dashboard, Books revenue |
| EW Report  | `employee_shifts`, `z_report_server_tips` | Payroll, per-server tips |
| Item Audit | `inventory_items`, `inventory_categories` | Inventory, analytics     |

### The trading day

A bar open 17:00–03:00 trades across two calendar dates. 2Touch records only
when a ticket was rung, so truncating that timestamp files the hours after
midnight under the following day — and sales show up on days the bar was shut.

`Sync.BusinessDayCutoffHour` (default `4`) is the hour that starts a new trading
day. The agent subtracts it before truncating, so a drink rung at 01:40 Sunday
is counted against Saturday night. 4am is after last call at nearly every venue
and before any opening time, so no real session straddles it; a club trading
until 6am should raise it.

Setup picks the value from the mapped column's SQL type and shows it in stage 7:

| Mapped date column | Cutoff | Why |
|--------------------|--------|-----|
| `datetime`, `datetime2`, `smalldatetime`, `datetimeoffset` | `4` | still holds the hour the ticket was rung |
| `date` | `0` | already rounded to a trading date — shifting it would move every night back a day |

Set it to `0` by hand only if the source genuinely supplies a business date.
Changing it does not rewrite history: the agent re-sends the last
`LookbackDays` days, and ingest upserts on `(organization_id, report_date)`, so
only that window is corrected. Anything older needs a backfill in Rail.

## Security

- **Read-only:** the agent only issues `SELECT`, as `NT AUTHORITY\SYSTEM` or the
  `BarAppRead` login, each granted nothing beyond `db_datareader`.
- **No inbound ports:** the box only makes outbound HTTPS to Rail. SQL is never
  exposed to the network (shared memory is in-process IPC).
- **Per-org HMAC:** each request is signed HMAC-SHA256 over the exact request body,
  keyed by that bar's unique agent token — no shared secret across bars.

## No keyboard on the POS box

A broken keyboard makes the menu unusable — it needs a number typed — and the
wizard needs the pairing code pasted. `INSTALL - no keyboard needed.cmd` drives
`--unattended` instead: double-click, click Yes on the UAC prompt, and read the
result in the Notepad window it opens. Nothing waits for a keypress, including
on the failure paths — errors go to `install-log.txt` and open in Notepad rather
than sitting behind a "press any key".

It needs `rail-setup.exe`, `rail-2touch-agent.exe` and `Key.txt` in the same
folder, and checks for them before asking for Administrator, so a missing file
costs no UAC prompt.

`rail-diagnose.exe` already needs no keyboard: it runs, writes its report, and
opens it.
