/**
 * Rail ↔ 2TouchPOS SQL Agent
 *
 * Runs on the Windows POS server as a Scheduled Task.
 * Queries the local TwoTouch SQL Server database and pushes data to Rail.
 *
 * Usage:
 *   node agent.js              — run one sync cycle
 *   node agent.js --test       — test SQL + API connection only
 *   node agent.js --days 7     — sync last 7 days instead of default lookback
 *
 * Scheduled Task setup (Windows):
 *   schtasks /create /tn "Rail 2Touch Sync" /tr "node C:\rail-agent\agent.js" /sc MINUTE /mo 5 /ru SYSTEM
 */

'use strict';

const sql    = require('mssql');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// ── Load config ───────────────────────────────────────────────────────────────

const configPath = path.join(__dirname, 'config.local.json');
if (!fs.existsSync(configPath)) {
  console.error('ERROR: config.local.json not found. Copy config.json → config.local.json and fill in your values.');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const testMode = process.argv.includes('--test');
const daysArg  = process.argv.includes('--days')
  ? parseInt(process.argv[process.argv.indexOf('--days') + 1], 10)
  : null;
const LOOKBACK = daysArg ?? cfg.sync?.lookbackDays ?? 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg)   { console.log(`[${new Date().toISOString()}] ${msg}`); }
function warn(msg)  { console.warn(`[${new Date().toISOString()}] WARN: ${msg}`); }
function error(msg) { console.error(`[${new Date().toISOString()}] ERROR: ${msg}`); }

function pad(n) { return String(n).padStart(2, '0'); }
function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Sign the payload with HMAC-SHA256 for the Rail API */
function sign(payload) {
  return crypto
    .createHmac('sha256', cfg.rail.authToken)
    .update(JSON.stringify(payload))
    .digest('hex');
}

/** POST data to Rail with HMAC signature */
async function postToRail(path, payload) {
  const sig = sign(payload);
  const res = await fetch(`${cfg.rail.apiUrl.replace('/ingest', '')}${path}`, {
    method:  'POST',
    headers: {
      'Content-Type':       'application/json',
      'X-Rail-Signature':   sig,
      'X-Rail-Agent':       'rail-2touch-agent/1.0',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Rail API ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

// ── SQL Queries ───────────────────────────────────────────────────────────────

const C = cfg.columns;

/** Build the cutoff date string for SQL (YYYY-MM-DD) */
function cutoffDate() {
  const d = new Date();
  d.setDate(d.getDate() - LOOKBACK);
  return isoDate(d);
}

async function queryZReports(pool) {
  const t = cfg.tables.zReport;
  const c = C.zReport;
  const query = `
    SELECT
      CAST(${c.date} AS DATE)        AS report_date,
      SUM(${c.sales})                AS total_sales,
      SUM(${c.ccTips})               AS cc_tips,
      SUM(${c.cashTips})             AS cash_tips
    FROM ${t}
    WHERE CAST(${c.date} AS DATE) >= '${cutoffDate()}'
    GROUP BY CAST(${c.date} AS DATE)
    ORDER BY report_date DESC`;

  const result = await pool.request().query(query);
  return result.recordset.map(r => ({
    report_date: isoDate(new Date(r.report_date)),
    total_sales: parseFloat(r.total_sales) || 0,
    cc_tips:     parseFloat(r.cc_tips)     || 0,
    cash_tips:   parseFloat(r.cash_tips)   || 0,
  }));
}

async function queryEWReports(pool) {
  const t = cfg.tables.ewReport;
  const c = C.ewReport;
  const query = `
    SELECT
      CAST(${c.date} AS DATE)        AS shift_date,
      ${c.employeeName}              AS employee_name,
      ISNULL(${c.totalSales}, 0)     AS total_sales,
      ISNULL(${c.tipsPaidOut}, 0)    AS tips_paid_out,
      ISNULL(${c.regularHours}, 0)   AS regular_hours,
      ISNULL(${c.overtimeHours}, 0)  AS overtime_hours
    FROM ${t}
    WHERE CAST(${c.date} AS DATE) >= '${cutoffDate()}'
    ORDER BY shift_date DESC, employee_name`;

  const result = await pool.request().query(query);
  return result.recordset.map(r => ({
    shift_date:     isoDate(new Date(r.shift_date)),
    employee_name:  r.employee_name?.trim() ?? '',
    total_sales:    parseFloat(r.total_sales)    || 0,
    tips_paid_out:  parseFloat(r.tips_paid_out)  || 0,
    regular_hours:  parseFloat(r.regular_hours)  || 0,
    overtime_hours: parseFloat(r.overtime_hours) || 0,
  })).filter(r => r.employee_name);
}

async function queryItemAudit(pool) {
  const t = cfg.tables.itemAudit;
  const c = C.itemAudit;
  const query = `
    SELECT
      CAST(${c.date} AS DATE)        AS sale_date,
      ${c.itemName}                  AS item_name,
      ${c.category}                  AS category_name,
      SUM(${c.qtySold})              AS qty_sold,
      SUM(${c.netSales})             AS net_sales
    FROM ${t}
    WHERE CAST(${c.date} AS DATE) >= '${cutoffDate()}'
    GROUP BY CAST(${c.date} AS DATE), ${c.itemName}, ${c.category}
    ORDER BY sale_date DESC, net_sales DESC`;

  const result = await pool.request().query(query);
  return result.recordset.map(r => ({
    sale_date:     isoDate(new Date(r.sale_date)),
    item_name:     r.item_name?.trim()    ?? '',
    category_name: r.category_name?.trim() ?? '',
    qty_sold:      parseFloat(r.qty_sold)  || 0,
    net_sales:     parseFloat(r.net_sales) || 0,
  })).filter(r => r.item_name);
}

// ── Main sync ─────────────────────────────────────────────────────────────────

async function run() {
  log(`Starting sync — lookback: ${LOOKBACK} day(s)${testMode ? ' [TEST MODE]' : ''}`);

  let pool;
  try {
    const connConfig = {
      server:   cfg.sql.server,
      database: cfg.sql.database,
      user:     cfg.sql.user,
      password: cfg.sql.password,
      options:  cfg.sql.options ?? { trustServerCertificate: true, encrypt: false },
    };
    // Only add port if explicitly set — dynamic ports use SQL Browser via instanceName
    if (cfg.sql.port) connConfig.port = cfg.sql.port;

    pool = await sql.connect(connConfig);
    log('✓ SQL Server connected');
  } catch (err) {
    error(`SQL connection failed: ${err.message}`);
    process.exit(1);
  }

  try {
    // ── Query all three report types ──────────────────────────────────────────
    let zRows = [], ewRows = [], auditRows = [];

    try {
      zRows = await queryZReports(pool);
      log(`  Z Reports:    ${zRows.length} day(s)`);
    } catch (e) { warn(`Z Report query failed: ${e.message}`); }

    try {
      ewRows = await queryEWReports(pool);
      log(`  EW Reports:   ${ewRows.length} row(s)`);
    } catch (e) { warn(`EW Report query failed: ${e.message}`); }

    try {
      auditRows = await queryItemAudit(pool);
      log(`  Item Audit:   ${auditRows.length} row(s)`);
    } catch (e) { warn(`Item Audit query failed: ${e.message}`); }

    if (testMode) {
      log('\n── SAMPLE DATA (test mode — not sending to Rail) ──');
      if (zRows.length)    log('Z Report sample:   ' + JSON.stringify(zRows[0]));
      if (ewRows.length)   log('EW Report sample:  ' + JSON.stringify(ewRows[0]));
      if (auditRows.length) log('Item Audit sample: ' + JSON.stringify(auditRows[0]));
      log('\n✓ SQL connection and queries OK');
      return;
    }

    // ── Push to Rail API ──────────────────────────────────────────────────────
    if (!cfg.rail.orgId || cfg.rail.orgId.startsWith('REPLACE')) {
      error('rail.orgId is not configured. Copy it from Rail → Settings → POS Integration → 2TouchPOS');
      process.exit(1);
    }

    const payload = {
      org_id:     cfg.rail.orgId,        // REQUIRED — routes data to the correct bar
      source:     '2touch-sql-agent',
      pulledAt:   new Date().toISOString(),
      zReports:   zRows,
      ewReports:  ewRows,
      itemAudit:  auditRows,
    };

    const result = await postToRail('/ingest', payload);
    log(`✓ Rail sync complete: ${JSON.stringify(result)}`);

  } finally {
    await pool.close();
  }
}

run().catch(err => {
  error(err.message);
  process.exit(1);
});
