#!/usr/bin/env node
/**
 * Renames an organisation.
 *
 * Dry run by default. Nothing is written until you pass --apply, because this
 * changes a name that appears on every page the bar's staff look at.
 *
 *   node scripts/rename-org.mjs                       # show what would change
 *   node scripts/rename-org.mjs --apply               # do it
 *   node scripts/rename-org.mjs --apply --slug        # also refresh the slug
 *   node scripts/rename-org.mjs --from "X" --to "Y"   # override the names
 *
 * WHAT IT TOUCHES
 *
 * organizations.name, and nothing else by default.
 *
 * The slug is left alone unless asked. It is never used as a lookup key or in a
 * route in this codebase — the one component it is passed to (NotificationBell)
 * does not even read it — so changing it gains nothing, and it is exactly the
 * kind of stable identifier something external ends up depending on. --slug is
 * for tidiness, not correctness.
 *
 * The name is not denormalised into any other table, so there is no second copy
 * to keep in step. bar_settings.nacha_company_name is a SEPARATE field set by
 * hand for direct deposit; this script reports it when it looks related but
 * never rewrites it, because the legal entity on a bank file is not necessarily
 * the trading name.
 */

import { readFileSync } from 'node:fs';

// ── Defaults ────────────────────────────────────────────────────────────────
// The spelling being corrected. Override with --from / --to.
const DEFAULT_FROM = 'Scotties On Vine';
const DEFAULT_TO = 'Scottys On Vine';

// ── Arguments ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const value = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const FROM = value('--from', DEFAULT_FROM);
const TO = value('--to', DEFAULT_TO);
const APPLY = has('--apply');
const SLUG = has('--slug');

// ── Environment ─────────────────────────────────────────────────────────────
// Read straight from .env.local so this runs without a dev server.
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch {
  // Fall through to whatever is already in the environment.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Run from the project root, where .env.local lives.');
  process.exit(1);
}

/**
 * Minimal PostgREST client over fetch.
 *
 * Deliberately not @supabase/supabase-js — this needs one select and one update,
 * and staying dependency-free means it keeps working regardless of what the
 * app's SDK version does. Service role, because organizations is RLS-protected
 * and this runs outside any session.
 */
async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.message ?? `${res.status} ${res.statusText}`);
  return body;
}

/** PostgREST filters need their values escaped. */
const q = (s) => encodeURIComponent(s);

/** Matches how setup/actions.ts builds a slug, minus the random suffix. */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

async function main() {
  console.log(`\n  ${bold('Rename organisation')}`);
  console.log(`  from  "${FROM}"`);
  console.log(`  to    "${TO}"`);
  console.log(dim(`  mode  ${APPLY ? 'APPLY — will write' : 'dry run — nothing will be written'}\n`));

  if (FROM === TO) {
    console.log('  Nothing to do: the names are identical.');
    return 0;
  }

  // Case-insensitive, so a partially-applied rename still matches and reruns
  // are safe.
  let matches;
  try {
    matches = await rest(
      `organizations?name=ilike.${q(FROM)}&select=id,name,slug,bar_settings`,
    );
  } catch (err) {
    console.error(`  Lookup failed: ${err.message}`);
    return 1;
  }

  if (!matches || matches.length === 0) {
    // Already renamed is a success, not a failure.
    const already = await rest(`organizations?name=ilike.${q(TO)}&select=id,name`);
    if (already?.length) {
      console.log(`  Already named "${already[0].name}" — nothing to do.`);
      return 0;
    }

    console.error(`  No organisation named "${FROM}".`);
    console.error('  Check the spelling, or pass --from "exact current name".');
    return 1;
  }

  // Renaming several at once is never intentional; stop rather than guess.
  if (matches.length > 1) {
    console.error(`  ${matches.length} organisations match "${FROM}":`);
    for (const m of matches) console.error(`    ${m.id}  ${m.name}`);
    console.error('  Refusing to rename more than one. Narrow it with --from.');
    return 1;
  }

  const org = matches[0];
  const suffix = org.slug.split('-').pop();
  const newSlug = SLUG ? `${slugify(TO)}-${suffix}` : org.slug;

  console.log(`  Organisation ${dim(org.id)}`);
  console.log(`    name  "${org.name}"  ->  "${TO}"`);
  console.log(
    SLUG
      ? `    slug  ${org.slug}  ->  ${newSlug}`
      : dim(`    slug  ${org.slug}  (unchanged — pass --slug to refresh it)`),
  );

  // Surfaced, never rewritten: a bank file carries a legal entity name, which
  // is not necessarily the trading name being corrected here.
  const nacha = org.bar_settings?.nacha_company_name;
  const stem = FROM.split(' ')[0].toLowerCase();
  if (nacha && nacha.toLowerCase().includes(stem)) {
    console.log(`\n  ${bold('Also worth checking')}`);
    console.log(`    bar_settings.nacha_company_name is "${nacha}".`);
    console.log("    That appears on employees' bank statements and is NOT changed here.");
    console.log('    Update it in Settings -> General if it should match.');
  }

  if (!APPLY) {
    console.log(`\n  ${dim('Dry run. Re-run with --apply to write.')}\n`);
    return 0;
  }

  const update = SLUG ? { name: TO, slug: newSlug } : { name: TO };
  try {
    await rest(`organizations?id=eq.${org.id}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
  } catch (err) {
    console.error(`\n  Update failed: ${err.message}`);
    return 1;
  }

  // Read back rather than trusting the write — the point of a rename script is
  // being able to say it actually happened.
  const [after] = await rest(`organizations?id=eq.${org.id}&select=name,slug`);
  const ok = after?.name === TO;

  console.log(`\n  ${ok ? green('Done') : red('Verification failed')}`);
  console.log(`    name  "${after?.name}"`);
  console.log(`    slug  ${after?.slug}`);
  console.log(dim('\n  Pages render per request, so the new name shows on next load.\n'));

  return ok ? 0 : 1;
}

// exitCode rather than process.exit(): forcing an exit while Node still holds a
// socket makes libuv assert on Windows, printing "Assertion failed" after an
// otherwise clean run and returning 127.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`\n  Unexpected failure: ${err?.message ?? err}`);
    process.exitCode = 1;
  });
