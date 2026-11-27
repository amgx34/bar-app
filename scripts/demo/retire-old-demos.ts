// `npm run demo:retire [-- --apply] [-- --allow-remote]`
// Retires the old per-visitor demo orgs and users. DRY RUN unless --apply is passed.
// Refuses anything but the dev project (same guard as demo:seed). What counts as
// old is decided by planRetire in lib/demo/retire.ts: the permanent sample bars
// and the shared visitor are never listed, and an org a real person belongs to is skipped.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { readEnvValue } from '../dev/live-guard.ts';
import { assertSeedTarget } from '../../lib/demo/universal.ts';
import { planRetire } from '../../lib/demo/retire.ts';

const root = process.cwd();
nextEnv.loadEnvConfig(root, true);
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const read = (f: string) => (existsSync(resolve(root, f)) ? readEnvValue(readFileSync(resolve(root, f), 'utf8'), 'NEXT_PUBLIC_SUPABASE_URL') : undefined);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
try {
  assertSeedTarget(url, read('.env.development.local'), read('.env.local'), args.includes('--allow-remote'));
} catch (e) {
  console.error(`\n${(e as Error).message}\n`);
  process.exit(1);
}
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) { console.error('SUPABASE_SERVICE_ROLE_KEY is not set.'); process.exit(1); }
const db = createClient(url!, key, { auth: { persistSession: false } });

// PostgREST caps a select at 1000 rows. A cut-off membership list would hide a real
// person on an org, so every row is read.
async function readAll<T>(table: 'organizations' | 'memberships', cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    // admin-scope-ok: cross-org housekeeping, read only. Selection is planRetire's.
    const { data, error } = await db.from(table).select(cols).order('id').range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data as T[]));
    if (data.length < 1000) return out;
  }
}

async function main() {
  const orgs = await readAll<{ id: string; slug: string | null; created_at: string; bar_settings: Record<string, unknown> | null }>(
    'organizations', 'id, slug, created_at, bar_settings');

  const users: { id: string; email?: string | null; created_at: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 200) break;
  }

  const memberships = await readAll<{ user_id: string; organization_id: string }>('memberships', 'user_id, organization_id');

  const plan = planRetire({ orgs, users, memberships });
  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY RUN (nothing deleted)',
    orgsToDelete: plan.orgs.length, usersToDelete: plan.users.length,
    protectedOrgsSkipped: plan.protectedOrgs.length, oldestOrg: plan.oldestOrg, newestOrg: plan.newestOrg,
    totalOrgsInProject: orgs.length, totalUsersInProject: users.length,
  }, null, 2));
  if (!apply) return;

  for (let i = 0; i < plan.orgs.length; i += 25) {
    const ids = plan.orgs.slice(i, i + 25).map((o) => o.id);
    // admin-scope-ok: ids come from planRetire, which only returns old per-visitor demo orgs.
    const { error } = await db.from('organizations').delete().in('id', ids);
    if (error) throw new Error(`delete organizations: ${error.message}`);
  }
  for (const u of plan.users) {
    const { error } = await db.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`delete user ${u.id}: ${error.message}`);
  }
  console.log(`Deleted ${plan.orgs.length} orgs and ${plan.users.length} users.`);
}

main().catch((e) => { console.error((e as Error).message); process.exit(1); });
