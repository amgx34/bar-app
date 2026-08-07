# 2Touch Agent One-File Installer — Design

**Date:** 2026-08-07
**Status:** Approved, ready for implementation planning
**Component:** `2touch-agent-dotnet/`

## Problem

Installing the Rail 2Touch agent on a bar's POS box currently takes six manual
steps: publish the exe, copy two files, run a SQL script in SSMS to create the
`BarAppRead` login, hand-write `appsettings.local.json` with a UUID and a 64-char
hex token, run `--test`, then run `install-service.ps1` from an elevated prompt.

Three things make this worse than the step count suggests:

1. **The SQL script does not exist.** `2touch-agent-dotnet/README.md` step 3
   points at `../2touch-agent/2touchpart1.sql`. That file is not in the repo.
   The one manual SQL step is undocumented in practice.
2. **The default schema is fiction.** `Tables.ZReport` = `vwZReport`,
   `Tables.EwReport` = `vwServerSales`, `Tables.ItemAudit` = `vwItemAudit` exist
   only in `TwoTouchTest`, the database created by
   `testdata/01-create-test-db.sql`. A real TwoTouch database has none of them.
   Any install that trusts the defaults fails at the first query.
3. **Hand-copied secrets.** A 64-character hex token typed or partially pasted
   into JSON is a silent failure that surfaces later as a 401.

## Goal

Copy **one file** to the POS box, double-click it, answer a few prompts, and
leave the site having watched real data land in Rail.

## Non-goals

Explicitly out of scope. Each was considered and rejected:

- **GUI.** The operator is technical and on-site. A console wizard is enough and
  keeps single-file publish trivial.
- **MSI / Inno Setup.** Needs an external toolchain, and the genuinely hard parts
  here (probing SQL, proposing and confirming a schema mapping) are exactly what
  MSI is bad at. It would wrap this design, not replace it.
- **Separate installer binary.** Embedding a self-contained exe inside another
  roughly doubles the artifact to ~140MB and creates two things to version.
- **Auto-update, Add/Remove Programs entry, non-2Touch POS support.**
- **Rail-hosted schema profiles.** Decided against: mappings are discovered fresh
  on each box (see "Decisions").

## Audience

The installer is run by the Rail operator on-site: technical, comfortable with
Windows and SQL Server, able to supply `sa` credentials if asked. The wizard
optimises for speed and the elimination of typos, not for explaining what a
Windows Service is.

## Decisions

Settled during brainstorming; recorded here because each closes off an
alternative an implementer might otherwise reach for.

| Decision | Choice | Rejected alternative |
|---|---|---|
| Packaging | Setup mode inside the existing agent exe | Separate installer exe; MSI/Inno |
| Credentials | One pasted pairing code | Typing two fields; pre-baked per-org exe; CLI flags |
| SQL access | Windows auth first, fall back to creating a SQL login | Windows-auth only; SQL-login only; manual SQL step |
| Schema mapping | Discovered fresh on every box | Baked into the exe; served by Rail at pairing time |
| UI | Console wizard | GUI |

The real TwoTouch schema is only partly known and no live box was available when
this was written, so the scorer ships with generic heuristics only. Stage 12
prints the confirmed mapping as JSON so a real install's findings can be fed back
into the repo as seed synonyms later.

## Architecture

One binary, `rail-2touch-agent.exe`. No new project, no second artifact. The file
you copy is the file that installs is the file that runs.

### Mode selection

Resolved in `Program.cs` before the host is built:

| Invocation | Behaviour |
|---|---|
| Launched by the SCM (`WindowsServiceHelpers.IsWindowsService()`) | Service loop — unchanged |
| `--setup` | Setup wizard |
| No args, interactive console (double-click) | Setup wizard |
| No args, non-interactive | Service loop — unchanged fallback |
| `--run` | Foreground loop — today's bare no-args behaviour, preserved for debugging |
| `--uninstall` | Stop and delete the service; leave config and install directory in place |
| `--test`, `--once`, `--days N` | Unchanged |

The SCM check must come first: a service launch passes no args and must never
reach the wizard.

### Configuration layering

`appsettings.json` becomes an **embedded resource**, loaded first, so the exe
alone is sufficient. Layering, lowest to highest priority:

1. Embedded `appsettings.json` (defaults)
2. On-disk `appsettings.json` (optional — still a valid override)
3. `appsettings.local.json` (optional — what the wizard writes)

### Install layout

```
C:\rail-agent\
├── rail-2touch-agent.exe      ← wizard copies itself here
└── appsettings.local.json     ← wizard writes; org credentials + resolved schema
```

`appsettings.local.json` is ACL'd to Administrators and SYSTEM only, because in
the fallback path it holds a SQL password.

### Service registration

`install-service.ps1` is **deleted**. Its behaviour moves into the wizard as
in-process `sc.exe` calls — two ways to install is how they drift apart.

Registration uses an explicit content root:

```
binpath= "C:\rail-agent\rail-2touch-agent.exe --contentRoot C:\rail-agent"
start= auto
```

Microsoft documents `--contentRoot` in the binpath as the way to control a
service's configuration base directory. Setting it explicitly means config
resolution never depends on the service's default working directory.

Failure policy is unchanged from the current script: `reset= 86400`,
`actions= restart/60000/restart/60000/restart/60000`.

### Elevation

The wizard checks `WindowsIdentity` for the Administrators role on entry. If
absent it relaunches itself via `ShellExecute` with the `runas` verb and the same
arguments, then exits — so a double-click from Explorer produces a UAC prompt
rather than an access-denied error.

## Pairing code

### Format

```
RAIL1-<base64url({"o":"<orgId>","t":"<agentToken>","u":"<apiBaseUrl>"})>
```

### Validation

Structural, not a checksum:

- `o` must parse as a UUID.
- `t` must be exactly 64 lowercase hex characters — matching
  `randomBytes(32).toString('hex')` in `app/(app)/app/settings/actions.ts`.
- `u` must be an absolute `https://` URL.

A truncated or corrupted paste fails at least one of these. That is the
checksum; no CRC is added.

### Rail-side change

`app/(app)/app/settings/_components/pos-panel.tsx` currently renders Org ID and
Token as two separate fields with a "Copy both" button. It is replaced by a
single copyable pairing code.

**The code is assembled server-side**, in `get2TouchAgentConfig()` in
`app/(app)/app/settings/actions.ts`, which gains a `pairingCode` field alongside
the `{ orgId, agentToken }` it already returns. This is deliberate: `pos-panel`
is a client component, and `SITE_URL` in `lib/site.ts` resolves from
`VERCEL_PROJECT_PRODUCTION_URL`, which is not a `NEXT_PUBLIC_` variable and is
therefore undefined in the browser. Building the code client-side would silently
fall through to the hardcoded default origin and hand out pairing codes pointing
at the wrong host on any non-default deployment.

This is the only application-code change outside `2touch-agent-dotnet/`.
Documentation changes elsewhere are listed at the end of this document.

## Wizard flow

Twelve stages. Each prints an `[n/12]` header and either a `✓` line or a
diagnosis. Re-running the wizard on an already-installed box is supported: it
stops the service, rewrites config, and restarts. Fixing a bad mapping is a
re-run, not an uninstall.

**1. Elevate.** As described above.

**2. Pairing code.** Prompt for one paste; validate as above.

**3. Verify pairing.** POST an empty payload
(`zReports: [], ewReports: [], itemAudit: []`) to `/api/2touch/ingest` with a
real HMAC signature.

Every write in that route is guarded by `if (data.X?.length)`, so an empty
payload is a genuine no-op that still exercises HMAC verification and org
resolution, returning `{"zReports":0,"ewReports":0,"itemAudit":0,"errors":[]}`.
**No new Rail endpoint is required.** This distinguishes network failure, `401`
(wrong token) and `400` (wrong org) before anything is installed.

**4. Find SQL Server.** Read
`HKLM\SOFTWARE\Microsoft\Microsoft SQL Server\InstalledInstances`. Offer the
list; default to the sole entry when there is only one. Connect with the `lpc:`
prefix — shared memory, so no TCP port and no SQL Server Browser, which is the
whole reason this agent is .NET.

**5. Find the database.** Query `sys.databases`. Select `TwoTouch` if present,
otherwise offer the list.

**6. Establish read access.** Windows auth first, SQL login as fallback:

- Check `IS_SRVROLEMEMBER('sysadmin')` for the elevated Windows identity.
- **If sysadmin:** `CREATE LOGIN [NT AUTHORITY\SYSTEM] FROM WINDOWS` if it does
  not exist, map a database user in the target database, grant `db_datareader`.
  Config records `"User": ""` (Integrated Security) and the service runs as
  `LocalSystem`. No password is stored anywhere, Mixed Mode is not required, and
  SQL Server is not restarted.
- **If not sysadmin, or the grant fails:** prompt for `sa` credentials, create
  `BarAppRead` with a generated 32-character password, grant `db_datareader`,
  and write the password into `appsettings.local.json`. The password is drawn
  from `A-Z a-z 0-9` plus `_ - . !` — enough entropy at 32 characters, while
  avoiding quotes, backslashes and semicolons that would need escaping in both a
  connection string and a JSON file.
- **If the server is not in Mixed Mode**, say so explicitly and state that
  enabling it requires a SQL Server restart. Stop and let the operator decide.
  Never restart SQL Server on a live POS box unasked.

**7. Schema discovery.** See the next section.

**8. Preview.** Run all three configured queries at a 7-day lookback and print
row counts plus a few sample rows. Nothing is sent to Rail.

**9. Write config.** `C:\rail-agent\appsettings.local.json`, ACL'd as above.

**10. Install.** Copy the running executable to `C:\rail-agent\` (a no-op if it
is already running from there), register the service, apply the failure policy.

**11. Start and verify.** Start the service, then run one real sync in-process
and print Rail's actual response — `{"zReports":7,...}`. The operator leaves the
site having seen data land, rather than having seen a service reach "Running".

**12. Summary.** Print the install path, service name (`Rail2TouchSync`), Event
Log source, the `--uninstall` command, and the confirmed schema mapping as a JSON
block for feeding back into the repo.

## Schema discovery

Runs after stage 6 and connects with the exact credentials the service will use,
so it proves read access end-to-end rather than assuming it.

### Enumerate

One query joins `INFORMATION_SCHEMA.TABLES` and `INFORMATION_SCHEMA.COLUMNS`
across the database, returning every relation with its columns and data types.
Tables and views are both candidates.

### Feed requirements

| Feed | Required columns |
|---|---|
| Z Report | date, net sales, credit-card tips, cash tips |
| EW Report | date, employee name, total sales, tips paid out, regular hours, overtime hours |
| Item Audit | date, item name, category, quantity sold, net sales |

These mirror `ZReportColumns`, `EwReportColumns` and `ItemAuditColumns` in
`Config/AgentConfig.cs`.

### Scoring

For each candidate relation, each target column is scored against every column
in that relation:

- Exact synonym hit: **10** (e.g. for Z Report net sales: `NetSales`,
  `net_sales`, `TotalSales`, `Sales`, `GrossSales`)
- Substring keyword hit: **5**
- Type compatible: **+2**
- **Type incompatible: disqualifying.** An `nvarchar` cannot be `SUM()`-ed. A
  relation with no type-compatible candidate for any required column is dropped
  for that feed entirely, rather than merely penalised.

Relation-name affinity adds **8** when the relation name matches the feed's
keyword family — `%z%`, `%report%`, `%daily%`, `%close%` for Z Report;
`%employee%`, `%server%`, `%shift%`, `%work%`, `%labor%` for EW Report;
`%item%`, `%product%`, `%menu%`, `%audit%`, `%inventory%` for Item Audit. These
are the same families `2touch-agent/discover-schema.sql` uses by hand today.

### Confirm

Per feed, print the top 5 relations with their scores and proposed column
mappings. The operator picks a number, accepts the mapping, overrides any single
column by choosing from that relation's column list, or skips the feed.

### Prove

Run the feed's real query with `TOP 5`. A SQL error returns to the mapping step
with the SQL and the server's error printed. A wrong guess is caught here,
cheaply, rather than at stage 11 or in production.

### Consequences for existing code

Two changes this forces:

- **Identifier safety.** `Services/SqlReader.cs` interpolates table and column
  names directly into SQL strings. Discovery writes bracket-quoted names —
  `"ZReport": "[dbo].[vwZReport]"`, `"Date": "[BusinessDate]"` — and every value
  originates from `INFORMATION_SCHEMA` output rather than free text. `SqlReader`
  needs no change, and existing unbracketed configs keep working.
- **Skippable feeds.** An empty `Tables.X` means the bar has no such feed.
  `Services/SyncService.cs` skips the query and sends an empty array, which the
  ingest route already handles. Today all three are queried unconditionally.

## Error handling

No raw exception traces reach the console. Each stage owns its diagnoses:

| Failure | Diagnosis |
|---|---|
| Pairing code malformed | Which field failed — "token must be 64 hex characters, got 61" |
| Ingest returns 401 | Token does not match this org's; re-copy from Settings → POS Integration |
| Ingest returns 400 | Org ID is not a configured 2Touch org |
| Network unreachable | Name the URL tried; note the box needs only outbound HTTPS |
| No SQL instance in registry | SQL Server is not installed here — likely the wrong machine |
| Not sysadmin and no `sa` | Which grant failed, and the statement a DBA must run instead |
| Mixed Mode disabled | Enabling it requires a SQL Server restart; stop and let the operator decide |
| Feed query throws | Print the SQL and the server's error; return to mapping |
| Service will not start | Print the last 5 `Rail2TouchSync` Event Log entries inline |

## Testing

The agent has no test project today. This adds `RailAgent.Tests` (xunit), run
with `dotnet test`.

### Unit tests

Covering the pure logic, which carries most of the risk:

- **Pairing code:** round-trip; truncated payload; wrong prefix; non-UUID org;
  63-character token; non-https URL.
- **Scorer:** ranks a correctly-named relation first; disqualifies a relation
  whose date column is `nvarchar`; drops a relation missing a required column;
  name affinity breaks a tie between two equally-scoring relations.
- **Config writer:** emits bracket-quoted identifiers; an empty table name
  round-trips as a skipped feed.
- **SyncService:** a skipped feed sends an empty array instead of querying.

### Integration tests

Run against the existing `testdata/` harness (`01-create-test-db.sql`,
`02-seed-test-data.sql`, `03-create-test-org.sql`) plus
`testdata/mock-ingest-server.js`.

**One addition is essential:** a second seed script creating equivalent data
under deliberately unlike names — `tblDayClose`, `EmpWorkSummary`,
`ItemSalesAudit`, with column names to match. Discovery tested against
`TwoTouchTest` alone would pass trivially, because those relation names are
already the configured defaults. Proving the scorer finds a schema it has never
seen is the entire point of the exercise.

### Manual verification

A real POS box remains the final gate. Stage 11 is what makes that a single
observation rather than a hunt through logs.

## Documentation

`2touch-agent-dotnet/README.md` is rewritten: the six-step Setup section becomes
publish, copy one file, double-click. This also removes the broken reference to
`../2touch-agent/2touchpart1.sql`, which does not exist.

The legacy `2touch-agent/INSTALLER-GUIDE.txt` section D still instructs
installers to enable TCP/IP, start SQL Server Browser, restart SQL Server, and
install Node.js — none of which the .NET agent needs. Its 2Touch section is
updated to point at the new flow.
