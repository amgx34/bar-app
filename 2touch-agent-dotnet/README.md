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

**1. Publish** (build machine — needs .NET SDK 9):

```powershell
cd 2touch-agent-dotnet
dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
```

**2. Copy to the POS box** — take `rail-2touch-agent.exe` and `appsettings.json`
from `bin\Release\net9.0\win-x64\publish\` to `C:\rail-agent\`. The box needs
nothing else installed (no Node, no .NET; TCP/IP and SQL Browser can stay off).

**3. Create the read-only login** — run `../2touch-agent/2touchpart1.sql` in SSMS
to create `BarAppRead`.

**4. Configure** — create `appsettings.local.json` next to the exe with your secrets
(gitignored, overrides `appsettings.json`):

```json
{
  "Agent": {
    "Sql":  { "Password": "YourStrongP@ss123!" },
    "Rail": { "OrgId": "...", "AuthToken": "..." }
  }
}
```

`OrgId` and `AuthToken` come from Rail → Settings → POS Integration → 2TouchPOS.

**5. Test** (nothing is sent to Rail until you're happy):

```powershell
.\rail-2touch-agent.exe --test    # connect + query, print samples, send nothing
.\rail-2touch-agent.exe --once    # one real sync, then exit
```

**6. Install as a service** (elevated PowerShell):

```powershell
.\install-service.ps1 -ExePath "C:\rail-agent\rail-2touch-agent.exe"
```

Runs on start, then every 5 min; auto-restarts on crash; logs to the Windows
Event Log (source `Rail2TouchSync`).
Uninstall: `Stop-Service Rail2TouchSync; sc.exe delete Rail2TouchSync`

### Options

- **Named SQL instance?** Add `"Server": ".\\SQLEXPRESS"` to the `Sql` block (double backslash in JSON).
- **Windows auth instead of a SQL login?** Set `"User": ""` and run the service as an account with read access to TwoTouch.
- **Different schema?** Override `Tables.*` / `Columns.*`; find real names with `../2touch-agent/discover-schema.sql`.
- **Different lookback?** Append `--days 7` to `--test` / `--once`.

## What gets synced

| Query      | → Rail table                          | Powers                   |
|------------|---------------------------------------|--------------------------|
| Z Report   | `z_report_days`                       | Dashboard, Books revenue |
| EW Report  | `employee_shifts`, `z_report_server_tips` | Payroll, per-server tips |
| Item Audit | `inventory_items`, `inventory_categories` | Inventory, analytics     |

## Security

- **Read-only:** the agent only issues `SELECT`. Use the `BarAppRead` login.
- **No inbound ports:** the box only makes outbound HTTPS to Rail. SQL is never
  exposed to the network (shared memory is in-process IPC).
- **Per-org HMAC:** each request is signed HMAC-SHA256 over the exact request body,
  keyed by that bar's unique agent token — no shared secret across bars.
