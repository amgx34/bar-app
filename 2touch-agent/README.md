# Rail ↔ 2TouchPOS SQL Agent

Pulls Z Reports, EW Reports, and Item Audit data directly from the TwoTouch
SQL Server database and pushes to Rail every 5 minutes.

## Prerequisites

- Windows PC / POS server with SQL Server access
- Node.js 18+ installed (https://nodejs.org)
- SQL Server TCP/IP enabled (SQL Server Config Manager → Protocols → TCP/IP → Enable → restart SQL Server service)
- The BarAppRead login created (run 2touchpart1.sql in SSMS)

## Setup

### 1. Copy agent files to the POS server

Copy this entire folder to `C:\rail-agent\` on the POS server.

### 2. Install dependencies

```cmd
cd C:\rail-agent
npm install
```

### 3. Discover the correct table names

Open SSMS, connect to the TwoTouch database, and run `discover-schema.sql`.
Note the actual table/view names for Z reports, EW reports, and item audit.

### 4. Configure the agent

```cmd
copy config.json config.local.json
notepad config.local.json
```

Edit config.local.json:
- `sql.password` → the BarAppRead password you set
- `rail.authToken` → copy TWOTOUCH_INGEST_SECRET from your Vercel env vars
- `tables.*` → update with actual table names from step 3
- `columns.*` → update with actual column names if different

### 5. Test the connection

```cmd
node agent.js --test
```

This connects to SQL Server and runs the queries WITHOUT sending to Rail.
Check that the sample data looks correct.

### 6. Schedule as a Windows Task (every 5 minutes)

Open Command Prompt as Administrator:

```cmd
schtasks /create ^
  /tn "Rail 2Touch Sync" ^
  /tr "node C:\rail-agent\agent.js" ^
  /sc MINUTE /mo 5 ^
  /ru SYSTEM ^
  /rl HIGHEST
```

Verify it's scheduled:
```cmd
schtasks /query /tn "Rail 2Touch Sync"
```

Run it immediately to test:
```cmd
schtasks /run /tn "Rail 2Touch Sync"
```

## Add TWOTOUCH_INGEST_SECRET to Vercel

In your Vercel project → Settings → Environment Variables, add:

| Key                      | Value                          |
|--------------------------|--------------------------------|
| TWOTOUCH_INGEST_SECRET   | (any long random string)       |

Then paste the same value into config.local.json → rail.authToken.

## What gets synced

| SQL query       | → Rail table             | Powers                    |
|-----------------|--------------------------|---------------------------|
| Z Report        | z_report_days            | Dashboard, Books revenue  |
| EW Report       | employee_shifts          | Payroll calculations      |
| EW Report       | z_report_server_tips     | Tip flags, per-server %   |
| Item Audit      | inventory_items          | Inventory tracking        |
| Item Audit      | inventory_categories     | Analytics by category     |

## Logs

Agent logs to stdout. To capture logs to a file, change the scheduled task command to:
```
cmd /c "node C:\rail-agent\agent.js >> C:\rail-agent\sync.log 2>&1"
```
