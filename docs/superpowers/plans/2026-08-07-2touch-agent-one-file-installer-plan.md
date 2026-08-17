# 2Touch Agent One-File Installer — Implementation Plan

**Spec:** [`../specs/2026-08-07-2touch-agent-one-file-installer-design.md`](../specs/2026-08-07-2touch-agent-one-file-installer-design.md)
**Date:** 2026-08-07

## Order of work

Bottom-up: pure logic first (it is what the tests cover), then the I/O shells,
then the wizard that composes them, then Rail, then docs.

### 1. Project shape

- `RailAgent.csproj` → `net9.0-windows`. Registry, `WindowsIdentity`, and file
  ACLs are all in the Windows targeting pack; the agent is Windows-only anyway.
- `appsettings.json` becomes an `EmbeddedResource` (logical name
  `RailAgent.appsettings.json`) **and** stays copied to the build output for
  local dev. `CopyToPublishDirectory=Never` for both json files so the publish
  folder really is one file.
- `<Compile Remove="tests/**" />` so the root project's glob does not swallow
  the new test project.
- Add `RailAgent.sln` so `dotnet test` from `2touch-agent-dotnet/` works.

### 2. Pure logic (`Setup/`)

| File | Contents |
|---|---|
| `PairingCode.cs` | `Encode` / `TryDecode` for `RAIL1-<base64url(json)>`; field-level error strings |
| `SchemaModel.cs` | `ColumnInfo`, `RelationInfo`, `ColumnKind`, `FieldSpec`, `FeedSpec`, match records |
| `FeedSpecs.cs` | The three feeds: required fields, synonyms, keywords, relation-name affinity |
| `SchemaScorer.cs` | Synonym 10 / keyword 5 / type +2, type-incompatible disqualifies, affinity +8 |

### 3. I/O shells (`Setup/`)

| File | Contents |
|---|---|
| `ConsoleUi.cs` | `[n/12]` headers, `✓` / `✗` lines, prompts, numbered choice, yes/no |
| `Elevation.cs` | Administrators-role check; `runas` relaunch with the same args |
| `SqlProbe.cs` | Registry instance list, `sys.databases`, `INFORMATION_SCHEMA` enumeration, sysadmin / Mixed Mode checks, the two grant paths |
| `LocalConfigWriter.cs` | Serialize `{ "Agent": … }` with bracket-quoted identifiers; ACL to Administrators + SYSTEM |
| `ServiceControl.cs` | `sc.exe` create/delete/start/stop/query/failure; recent Event Log entries |
| `SetupWizard.cs` | The twelve stages |

### 4. Existing-code changes forced by the design

- `Program.cs` — mode selection (SCM → `--setup` → interactive → `--run` /
  `--uninstall` / `--test` / `--once`), embedded-config layering.
- `Services/SqlReader.cs` — extract `BuildConnectionString` to a `static` the
  wizard reuses; make the class and its query methods `virtual` for tests.
- `Services/RailClient.cs` — extract the sign-and-POST core to a `static` the
  wizard can call with an ad-hoc `RailConfig` (stage 3 runs before any config
  exists); `PushAsync` becomes `virtual`.
- `Services/SyncService.cs` — an empty `Tables.X` skips that feed and sends an
  empty array.
- `install-service.ps1` — deleted.

### 5. Rail side (the only app-code change)

- `app/(app)/app/settings/actions.ts` — `buildPairingCode()`; both
  `save2TouchConfig()` and `get2TouchAgentConfig()` return `pairingCode`.
  Assembled server-side because `SITE_URL` is not `NEXT_PUBLIC_`.
- `app/(app)/app/settings/_components/pos-panel.tsx` — one copyable pairing
  code replaces the two fields and "Copy both".

### 6. Tests — `tests/RailAgent.Tests`

xunit. Pairing code (round-trip, truncation, prefix, non-UUID, 63-char token,
non-https), scorer (ranking, `nvarchar` date disqualification, missing column,
affinity tie-break), config writer (brackets, skipped feed round-trip),
SyncService (skipped feed sends an empty array).

### 7. testdata + docs

- `testdata/04-create-unlike-schema.sql` — `TwoTouchOdd` database with
  `tblDayClose` / `EmpWorkSummary` / `ItemSalesAudit`. A **separate** database,
  not extra tables in `TwoTouchTest`: alongside `vwZReport` the scorer would
  never be forced to find anything new.
- `2touch-agent-dotnet/README.md` — six steps become publish / copy / double-click;
  removes the broken `../2touch-agent/2touchpart1.sql` reference.
- `2touch-agent/INSTALLER-GUIDE.txt` — 2Touch section points at the new flow.

## Verification

`dotnet build`, `dotnet test`, `npx tsc --noEmit`, `npm run lint`.
A real POS box remains the final gate for stages 4–11.

## Added during implementation

Three things the design did not anticipate, each found by a test that failed:

1. **Weak-match flagging.** Type compatibility is the only hard gate, so an
   `INT` primary key is a legitimate candidate for "quantity sold" and a thin
   relation survives scoring with a nonsense mapping. Kept the scoring rule as
   specified — the operator confirms, after all — but a match made on type
   alone is now marked `← guess: name gives no clue, check this` in the
   mapping table, and a column proposed for two fields warns about
   double-counting.

2. **Stage 11 checks the service's own identity.** The in-process verification
   sync runs as the elevated operator. On the Windows-auth path the service
   runs as `LocalSystem`, whose SQL access is a different question, so stage 11
   now also waits up to 45s for the service's first Event Log entry and names
   that identity mismatch if it errored.

3. **`Xunit.SkippableFact`.** The SQL Server integration tests skip rather than
   fail where no local instance or `TwoTouchOdd` exists; xunit 2.9 has no
   built-in runtime skip.

## Revision after seeing a real TwoTouch schema

A production schema dump (`C:\Users\notug\2touchDB.sql`, 332 tables, 14 views)
falsified a premise of the design. The spec's "Decisions" table records
*"Schema mapping — discovered fresh on every box"*, rejecting Rail-hosted
profiles. Discovery alone cannot work:

- `vwZReport` / `vwServerSales` / `vwItemAudit` do not exist — as the spec
  already suspected.
- More seriously, **no single relation can supply EW Report or Item Audit.**
  Item names and categories are `INT` foreign keys into `tblItem`/`tblCategory`;
  line amounts are in a separate `RptCtg` table joined on `uKeyID`; the employee
  is two joins from the hours. Four relations per feed.

So a built-in mapping is now tried first, and generic discovery is the fallback
rather than the only path:

4. **`Setup/TwoTouchProfile.cs`** — fingerprints the schema by relation name and
   writes a **derived table** into `Tables.*`. `FROM` accepts a `SELECT` with
   joins exactly as it accepts a table name, so `SqlReader` needed no change,
   no views are created in the bar's database, and `db_datareader` still
   suffices. Feeds it cannot cover fall through to discovery.
5. **`{cutoff}` pushdown** — the outer `WHERE` filters `CAST(date AS DATE)`,
   which cannot seek. On a POS box `tblSalesHist` is the largest table and this
   runs every five minutes, so a table expression may push the same cutoff into
   each leg against the raw indexed column.
## Revision after the first real install attempt

Setup hung at stage 5 on a live POS box with no output for 10–15 minutes, far
past both the 15s connect timeout and the 30s command default. That is only
possible outside the code those timeouts govern, and stage 5 is where a
single-file exe first unpacks `Microsoft.Data.SqlClient.SNI.dll` — before any
connection logic runs. Antivirus inspecting that unsigned native library fits
the evidence; it has not been confirmed on the box.

7. **`Setup/Diagnostics.cs` (`--diagnose`)** — every prerequisite of the twelve
   stages, each under a wall-clock budget so the diagnostic cannot inherit the
   hang it exists to find. Writes a transcript for emailing off-site.
   `Diagnostics.Bounded` is `internal` with `InternalsVisibleTo` because a real
   SqlClient call hits its own `ConnectTimeout` first and never exercises ours.
8. **Report on what is configured, not what is available.** Testing the
   diagnostic found the same bug three times — a working non-configured
   instance, a substituted database, and the profile's queries standing in for
   hand-edited ones — each reporting green for a configuration the service
   cannot run. All three are now `[FAIL]`, with the stand-in used only to keep
   later checks informative.
9. **UTF-8 console output** — `✓`/`✗` and the report's rules were mojibake under
   the default OEM codepage. Fixed in `Program.cs` for every interactive mode.

## Revision: unattended install from a USB stick

10. **`Setup/Unattended.cs` (`--unattended`)** — pairing code from `Key.txt`,
    found beside the exe or on any removable drive, validated before elevation.
    Every prompt becomes a rule or a refusal; ambiguity between instances or
    databases is a hard stop naming the flag that resolves it, because a silent
    wrong choice writes a service that syncs the wrong bar's data. Discovery has
    no unattended form — feeds the profile does not cover are skipped and named.
11. **Loopback exception in `PairingCode`** — the code demanded https while the
    agent's own config already accepted `http://localhost:3999` for the mock
    server, making the pairing path stricter than the thing it configures and
    untestable end to end. Now https, or http to loopback only.
12. **Not verified:** a full unattended install. It needs elevation, and the only
    key available points at production — running it from a dev box would have
    installed a service pushing test data into a real bar's org. Key resolution,
    every refusal path, and the launcher's guards are tested; the twelve stages
    under `--unattended` are not.

## Revision: a menu on double-click

The USB route was abandoned. Double-click went straight into the wizard, which
left the diagnostic reachable only from a command line — no use to whoever is
standing at the POS box.

13. **`Setup/StartMenu.cs`** — double-click (or `--menu`) draws account, config
    and service state, then waits. Setup, diagnostics and uninstall are choices;
    nothing runs on its own. `--setup` still bypasses it, so scripted installs
    and the elevation relaunch are unchanged.
14. **EOF is a cancellation, not a default.** `ConsoleUi.Ask` looped forever and
    `Choose`/`Confirm` silently returned their defaults once `Console.ReadLine`
    started returning null. With a menu whose default is "Install", that meant a
    closed stdin would launch the wizard repeatedly. All three now raise
    `OperationCanceledException`, which the wizard already handled.
15. **Pre-setup failures name the right remedy.** On a box where setup has never
    run, the SQL checks test the exe's embedded defaults and failed telling the
    operator to edit a config file that does not exist. They now say to run
    setup instead.

## Revision: a standalone diagnostic

16. **`tools/RailDiagnose` → `rail-diagnose.exe`** — a second executable that
    runs the checks and asks nothing at all: no flag, no menu, no pause. It
    opens the report it writes, because a double-clicked console window closes
    before anyone can read it. A ProjectReference to the agent rather than a
    copy, so the checks cannot drift.
17. **Config is found where the service keeps it.** `Diagnostics` looked only in
    `AppContext.BaseDirectory`, which is right for the agent and wrong for a
    tool carried on a USB stick — it would have reported "setup has never run"
    about a working box. It now searches beside the exe and `C:\rail-agent`,
    prefers the installed copy, and names which file it used.

## Revision after the first real diagnostic report

A report from a production POS box (`TWOTOUCH0`, SQL instance `.\TWOTOUCH`)
settled the question the whole investigation had been circling:

```
* lpc:(local)      windows   4,576 ms  ...server was not found...
  lpc:.\TWOTOUCH   windows   4,577 ms  ...server was not found...
  np:.\TWOTOUCH    windows   4,577 ms  ...server was not found...
  .\TWOTOUCH       windows      72 ms  ok
```

Shared Memory is disabled on that instance. It was never antivirus, and never
the named instance in itself — the agent hardcoded `lpc:` and there was no
fallback, so setup could not connect on a box whose SQL Server was healthy and
answering in 72 ms over the default protocol.

18. **`SqlProbe.Protocols` + `OpenFirstWorkingAsync`** — shared memory, then the
    client default, then named pipes; 5s each so a full scan costs 15s rather
    than 45. Stage 4 no longer asserts a protocol; stage 5 discovers one, writes
    it to config, and says so when it is not shared memory.
19. **The diagnostic threw away what it had proved.** Section 8 re-opened the
    database with a hardcoded `lpc:` rather than the protocol the matrix had
    just established, so on this box it timed out and sections 8–10 never ran —
    losing exactly the schema evidence the report existed to collect.
20. **Shared memory failing alone is now named**, with the Configuration Manager
    path to re-enable it, since it is the one protocol immune to the dynamic
    port this design was built around.

6. **Hungarian-notation handling in the scorer** — the real schema is
   `fTotalSales`, `dtmClaimDate`, `szDescription` throughout. Matching now tries
   the name as written, with the prefix dropped, and word-order-free (which is
   how `fTipsCash` reaches the synonym `cashtips`). This only improves the
   fallback path; it does not rescue the two feeds that need joins.
