#!/usr/bin/env node
/**
 * Fails if a service-role query is not constrained to one organisation.
 *
 * `createAdminClient()` uses the service-role key and bypasses RLS, so the
 * database will not catch a missing tenant filter — only this will. The repo
 * had two real cross-tenant holes when this check was written, both in code
 * that looked fine at a glance.
 *
 * A `.from('table')…` chain passes if either:
 *   1. the chain constrains `organization_id`, or
 *   2. it carries an `admin-scope-ok:` comment within the 6 lines above,
 *      stating why it is safe.
 *
 * Option 2 exists because two legitimate patterns cannot be seen from the
 * chain itself: assert-then-mutate-by-primary-key, and background jobs that
 * route across orgs by design. Requiring a written reason keeps those
 * deliberate instead of accidental.
 *
 *   npm run audit:scope
 */
import fs from 'node:fs';
import path from 'node:path';

/** Not org-scoped by nature. */
const GLOBAL_TABLES = new Set([
  'organizations',   // keyed by id
  'memberships',     // the mapping itself
  'demo_requests',   // public contact form, no org exists yet
  'rate_limits',     // infrastructure
]);

const ANNOTATION = /admin-scope-ok:\s*(\S.*)/;
const ROOTS = ['app', 'lib'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const violations = [];
let chains = 0;
let annotated = 0;

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;

  for (const file of walk(root)) {
    const src = fs.readFileSync(file, 'utf8');
    if (!src.includes('createAdminClient')) continue;

    const lines = src.split('\n');
    const re = /\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;
    let m;

    while ((m = re.exec(src)) !== null) {
      const table = m[1];
      if (GLOBAL_TABLES.has(table)) continue;
      chains++;

      const rest = src.slice(m.index, m.index + 1500);
      const end = rest.indexOf(';');
      const chain = end === -1 ? rest : rest.slice(0, end);

      if (/organization_id/.test(chain)) continue;

      const lineNo = src.slice(0, m.index).split('\n').length;
      const preceding = lines.slice(Math.max(0, lineNo - 7), lineNo).join('\n');

      // The justification may sit above the statement or inside the chain —
      // both read fine, and position should not decide whether it counts.
      if (ANNOTATION.test(preceding) || ANNOTATION.test(chain)) { annotated++; continue; }

      const op = /\.insert\(|\.upsert\(/.test(chain) ? 'insert'
        : /\.update\(/.test(chain) ? 'update'
        : /\.delete\(/.test(chain) ? 'delete'
        : 'select';

      violations.push({
        file: file.replace(/\\/g, '/'),
        line: lineNo,
        table,
        op,
        snippet: (lines[lineNo - 1] ?? '').trim().slice(0, 100),
      });
    }
  }
}

console.log(`service-role chains scanned : ${chains}`);
console.log(`justified (admin-scope-ok)  : ${annotated}`);
console.log(`unscoped and unjustified    : ${violations.length}`);

if (violations.length === 0) {
  console.log('\nOK — every service-role query is org-scoped or justified.');
  process.exit(0);
}

console.error('\nEach of these bypasses RLS without constraining organization_id.');
console.error('Add the filter, or document why it is safe with a comment above it:');
console.error('  // admin-scope-ok: <reason>\n');

let current = '';
for (const v of violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
  if (v.file !== current) { current = v.file; console.error(`── ${v.file}`); }
  console.error(`   :${String(v.line).padEnd(5)} ${v.op.padEnd(7)} ${v.table.padEnd(24)} ${v.snippet}`);
}

process.exit(1);
