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
6. **Hungarian-notation handling in the scorer** — the real schema is
   `fTotalSales`, `dtmClaimDate`, `szDescription` throughout. Matching now tries
   the name as written, with the prefix dropped, and word-order-free (which is
   how `fTipsCash` reaches the synonym `cashtips`). This only improves the
   fallback path; it does not rescue the two feeds that need joins.
