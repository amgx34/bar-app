# Exact Connection Guide — 2TouchPOS SQL Agent

The agent runs on the SAME Windows machine as 2Touch.
It never exposes SQL Server to the internet.
It only reads (SELECT) — never writes or modifies 2Touch data.

```
2Touch POS Server (Windows)
├── SQL Server (TwoTouch database)  ← agent connects here via localhost
├── Node.js agent (this script)     ← runs every 5 min as Scheduled Task
│     └── SELECT from TwoTouch tables
│     └── POST data to ──────────────────────────────────────────────────┐
└──────────────────────────────────────────────────────────────────────  │
                                                                          ▼
                                                 bar-app-drab.vercel.app
                                                 /api/2touch/ingest
```

═══════════════════════════════════════════════════════════════
STEP 1 — Find your SQL Server instance name
═══════════════════════════════════════════════════════════════

Open SSMS. The server name shown in the connection dialog is what you need.
Common values:
  • (local)          ← default unnamed instance
  • localhost        ← same as (local)
  • .\SQLEXPRESS     ← SQL Server Express
  • COMPUTERNAME     ← your PC's hostname
  • COMPUTERNAME\TwoTouch  ← named instance

Write it down. You'll put it in config.local.json → sql.server

═══════════════════════════════════════════════════════════════
STEP 2 — Enable SQL Server Authentication (Mixed Mode)
═══════════════════════════════════════════════════════════════

The BarAppRead login uses a password (SQL auth), so the server
must allow SQL Server Authentication, not just Windows auth.

In SSMS:
  1. Right-click the server name in Object Explorer
  2. Click Properties
  3. Click Security (left panel)
  4. Under "Server authentication" select:
     ● SQL Server and Windows Authentication mode
  5. Click OK
  6. SSMS will say you need to restart SQL Server — do it in step 4

═══════════════════════════════════════════════════════════════
STEP 3 — Enable TCP/IP in SQL Server Configuration Manager
═══════════════════════════════════════════════════════════════

  1. Open Start → SQL Server Configuration Manager
     (if not found: Start → search "Sql Server Configuration")

  2. Expand: SQL Server Network Configuration
     → Protocols for MSSQLSERVER  (or your instance name)

  3. Right-click TCP/IP → Enable

  4. Double-click TCP/IP → IP Addresses tab
     → Scroll to IPAll at the bottom
     → Set TCP Port = 1433
     → Clear TCP Dynamic Ports (make it blank)

  5. Click OK

═══════════════════════════════════════════════════════════════
STEP 4 — Restart SQL Server
═══════════════════════════════════════════════════════════════

In SQL Server Configuration Manager:
  Left panel → SQL Server Services
  Right-click "SQL Server (MSSQLSERVER)" → Restart

Or in Command Prompt (as Administrator):
  net stop MSSQLSERVER && net start MSSQLSERVER

═══════════════════════════════════════════════════════════════
STEP 5 — Verify BarAppRead login works
═══════════════════════════════════════════════════════════════

In SSMS, open a new query window and run:

  -- Verify the login exists
  SELECT name, type_desc FROM sys.server_principals
  WHERE name = 'BarAppRead';

  -- Verify the user exists in TwoTouch
  USE TwoTouch;
  SELECT name, type_desc FROM sys.database_principals
  WHERE name = 'BarAppRead';

  -- Verify it's in TTRead role
  SELECT r.name AS role_name, m.name AS member_name
  FROM sys.database_role_members rm
  JOIN sys.database_principals r ON r.principal_id = rm.role_principal_id
  JOIN sys.database_principals m ON m.principal_id = rm.member_principal_id
  WHERE m.name = 'BarAppRead';

If any of these return 0 rows, re-run the 2touchpart1.sql script.

Also test the login directly:
  File → Connect Object Explorer
  Authentication: SQL Server Authentication
  Login: BarAppRead
  Password: YourStrongP@ss123!
  → Connect

If this works, the agent will connect successfully.

═══════════════════════════════════════════════════════════════
STEP 6 — Find the actual 2Touch table names
═══════════════════════════════════════════════════════════════

While connected as BarAppRead (or your admin login), run
discover-schema.sql. Look for tables/views matching:

  Z Reports    → anything with "Z", "Daily", "Report", "Closing"
  EW Reports   → anything with "Employee", "Server", "Work"
  Item Audit   → anything with "Item", "Product", "Audit", "Sale"

Typical 2TouchPOS naming (try these first):

  SELECT TOP 3 * FROM dbo.vwZReport
  SELECT TOP 3 * FROM dbo.vwServerSales
  SELECT TOP 3 * FROM dbo.vwItemSales

If those fail, run this to see every table:
  SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_NAME

Share the table list if you need help identifying which ones to use.

═══════════════════════════════════════════════════════════════
STEP 7 — Install Node.js on the POS server
═══════════════════════════════════════════════════════════════

Download from https://nodejs.org → LTS version → Windows Installer
Run the installer (next, next, finish — defaults are fine).

Verify in Command Prompt:
  node --version    → should print v20.x.x or similar
  npm --version     → should print 10.x.x or similar

═══════════════════════════════════════════════════════════════
STEP 8 — Copy and configure the agent
═══════════════════════════════════════════════════════════════

  1. Create folder: C:\rail-agent\
  2. Copy agent.js, package.json, config.json into C:\rail-agent\

  3. Open Command Prompt:
       cd C:\rail-agent
       npm install

  4. Copy and edit config:
       copy config.json config.local.json
       notepad config.local.json

     Update these values:
       sql.server    → your instance name from Step 1
       sql.password  → YourStrongP@ss123! (or whatever you set)
       rail.authToken → copy TWOTOUCH_INGEST_SECRET from Vercel env vars
       tables.*      → table names found in Step 6
       columns.*     → column names (run "SELECT TOP 1 * FROM tablename"
                        in SSMS to see column names)

═══════════════════════════════════════════════════════════════
STEP 9 — Test before scheduling
═══════════════════════════════════════════════════════════════

  cd C:\rail-agent

  # Test SQL connection and queries only (does NOT send to Rail)
  node agent.js --test

  You should see output like:
    [2026-06-01T...] Starting sync — lookback: 2 day(s) [TEST MODE]
    [2026-06-01T...] ✓ SQL Server connected
    [2026-06-01T...]   Z Reports:    2 day(s)
    [2026-06-01T...]   EW Reports:   14 row(s)
    [2026-06-01T...]   Item Audit:   87 row(s)
    Z Report sample:   {"report_date":"2026-05-31","total_sales":4521.50,...}
    ✓ SQL connection and queries OK

  If you see errors, check config.local.json table/column names.

  # Once --test passes, do a real sync:
  node agent.js

═══════════════════════════════════════════════════════════════
STEP 10 — Schedule to run every 5 minutes
═══════════════════════════════════════════════════════════════

Open Command Prompt as Administrator, then run:

  schtasks /create /tn "Rail 2Touch Sync" /tr "node C:\rail-agent\agent.js" /sc MINUTE /mo 5 /ru SYSTEM /rl HIGHEST /f

Verify it was created:
  schtasks /query /tn "Rail 2Touch Sync" /fo LIST

Trigger it immediately to test:
  schtasks /run /tn "Rail 2Touch Sync"

Check logs (add logging to a file):
  schtasks /change /tn "Rail 2Touch Sync" /tr "cmd /c node C:\rail-agent\agent.js >> C:\rail-agent\sync.log 2>&1"

═══════════════════════════════════════════════════════════════
TROUBLESHOOTING
═══════════════════════════════════════════════════════════════

Problem: "Cannot connect to localhost"
Fix:     Check Step 3 (TCP/IP enabled) and Step 4 (service restarted)
         Try sql.server = "." or "localhost\SQLEXPRESS"

Problem: "Login failed for user 'BarAppRead'"
Fix:     Check Step 2 (Mixed Mode enabled) and Step 4 (restarted)
         Verify login with SSMS in Step 5

Problem: "Invalid object name 'vwZReport'"
Fix:     Run discover-schema.sql to find the correct table name
         Update tables.zReport in config.local.json

Problem: "Rail API → 401"
Fix:     Check rail.authToken in config.local.json matches
         TWOTOUCH_INGEST_SECRET in Vercel environment variables

Problem: Agent runs but no data in Rail dashboard
Fix:     Check Rail → Settings → POS Integration shows "2TouchPOS"
         Check that pos_provider = '2touch' in organizations table
