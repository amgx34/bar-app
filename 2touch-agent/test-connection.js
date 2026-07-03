/**
 * Connection test for dynamic-port SQL Server.
 * Tries every common instance name / connection method.
 *
 * Usage:
 *   node test-connection.js
 *   node test-connection.js --password "ActualPassword"
 */

'use strict';

const sql = require('mssql');
const os  = require('os');

const password = (() => {
  const i = process.argv.indexOf('--password');
  return i >= 0 ? process.argv[i + 1] : 'YourStrongP@ss123!';
})();

const hostname = os.hostname();

// Every combination we'll try
// Dynamic-port servers MUST use instanceName (triggers SQL Browser lookup)
const ATTEMPTS = [
  // ── Browser service (dynamic port) — most likely to work ──────────────────
  { label: 'localhost  + Browser (default instance)',  server: 'localhost',  instanceName: 'MSSQLSERVER' },
  { label: 'localhost  + Browser (2Touch instance)',   server: 'localhost',  instanceName: 'TwoTouch'    },
  { label: 'localhost  + Browser (SQLEXPRESS)',        server: 'localhost',  instanceName: 'SQLEXPRESS'  },
  { label: `${hostname} + Browser (default)`,          server: hostname,     instanceName: 'MSSQLSERVER' },
  { label: `${hostname} + Browser (2Touch)`,           server: hostname,     instanceName: 'TwoTouch'    },

  // ── Fixed port 1433 (works only if dynamic ports were set to 1433) ─────────
  { label: 'localhost  port 1433 (no instance)',       server: 'localhost',  port: 1433, instanceName: undefined },
  { label: '.\\SQLEXPRESS port 1433',                  server: '.\\SQLEXPRESS', port: 1433, instanceName: undefined },

  // ── Named pipe (local-only, bypasses TCP ports entirely) ──────────────────
  { label: 'Named pipe  \\\\.\\pipe\\sql\\query',
    server: 'localhost', useNamedPipes: true, pipePath: '\\\\.\\pipe\\sql\\query' },
];

async function tryConnect(attempt) {
  const config = {
    server:   attempt.server,
    database: 'TwoTouch',
    user:     'BarAppRead',
    password,
    options: {
      trustServerCertificate: true,
      encrypt:                false,
      connectTimeout:         6000,
    },
  };

  if (attempt.instanceName)  config.options.instanceName = attempt.instanceName;
  if (attempt.port)          config.port = attempt.port;

  let pool;
  try {
    pool = await sql.connect(config);
    const r = await pool.request().query(
      "SELECT @@SERVERNAME AS srv, @@SERVICENAME AS inst, " +
      "CONNECTIONPROPERTY('local_tcp_port') AS tcp_port"
    );
    const row = r.recordset[0];
    await pool.close();
    return { ok: true, srv: row.srv, inst: row.inst, port: row.tcp_port };
  } catch (e) {
    try { await pool?.close(); } catch {}
    const msg = e.message.includes('timeout')              ? 'timeout (Browser service may be stopped)'
              : e.message.includes('Login failed')         ? 'LOGIN FAILED — check password / Mixed Mode'
              : e.message.includes('Cannot open database') ? 'connected but "TwoTouch" db not found'
              : e.message.includes('ECONNREFUSED')         ? 'port refused (TCP/IP disabled or wrong port)'
              : e.message.slice(0, 80);
    return { ok: false, error: msg };
  }
}

async function main() {
  console.log('Testing 2TouchPOS SQL Server connection (dynamic ports)...\n');
  console.log('NOTE: Dynamic ports require SQL Server Browser service to be running.\n');

  let found = false;
  for (const attempt of ATTEMPTS) {
    process.stdout.write(`  [${attempt.label}] ... `);
    const r = await tryConnect(attempt);

    if (r.ok) {
      console.log(`✓  SERVER: ${r.srv}  INSTANCE: ${r.inst}  ACTUAL PORT: ${r.port}`);
      console.log('\n✅ SUCCESS — use this in config.local.json:\n');
      console.log(JSON.stringify({
        server:   attempt.server,
        database: 'TwoTouch',
        user:     'BarAppRead',
        password: '(your password)',
        options: {
          ...(attempt.instanceName ? { instanceName: attempt.instanceName } : {}),
          ...(attempt.port ? {} : {}),
          trustServerCertificate: true,
          encrypt: false,
        },
        ...(attempt.port ? { port: attempt.port } : {}),
      }, null, 2));
      found = true;
      break;
    } else {
      console.log(`✗  ${r.error}`);
    }
  }

  if (!found) {
    console.log('\n─────────────────────────────────────────────────────');
    console.log('None connected. Most likely cause: SQL Server Browser is not running.\n');
    console.log('Fix in SQL Server Configuration Manager:');
    console.log('  1. SQL Server Services → SQL Server Browser');
    console.log('     Right-click → Properties → Start Mode: Automatic → Apply');
    console.log('     Right-click → Start');
    console.log('');
    console.log('Then re-run:  node test-connection.js');
    console.log('');
    console.log('If still failing, find your actual instance name in SSMS:');
    console.log('  SELECT @@SERVICENAME   -- run this query');
    console.log('  Then add it to config.local.json → sql.options.instanceName');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
