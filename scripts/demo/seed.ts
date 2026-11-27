// `npm run demo:seed [-- --dry-run] [-- --allow-remote]`
// Creates or refreshes the three permanent sample bars. Safe to run any number
// of times. Refuses unless the target is the dev project (see assertSeedTarget).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { readEnvValue } from '../dev/live-guard.ts';
import { assertSeedTarget } from '../../lib/demo/universal.ts';
import { refreshUniversalDemo } from '../../lib/demo/universal-seed.ts';

const root = process.cwd();
nextEnv.loadEnvConfig(root, true); // same order `next dev` uses: .env.development.local wins
const args = process.argv.slice(2);
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
try {
  const report = await refreshUniversalDemo(db, { dryRun: args.includes('--dry-run'), password: process.env.DEMO_USER_PASSWORD });
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
