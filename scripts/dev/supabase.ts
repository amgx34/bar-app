// `npm run supabase -- <args>`: runs the guard, then the real Supabase CLI.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nextEnv from '@next/env';
import { readEnvValue } from './live-guard.ts';
import { assertSupabaseAllowed, projectRefFromUrl } from './supabase-guard.ts';

const root = process.cwd();
nextEnv.loadEnvConfig(root, true);

const localFile = resolve(root, '.env.local');
const liveRef = existsSync(localFile)
  ? projectRefFromUrl(readEnvValue(readFileSync(localFile, 'utf8'), 'NEXT_PUBLIC_SUPABASE_URL'))
  : '';
const targetRef =
  process.env.SUPABASE_PROJECT_REF?.trim().toLowerCase() || projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const args = process.argv.slice(2);

try {
  assertSupabaseAllowed({ args, targetRef, liveRef, allowLive: process.env.RAIL_ALLOW_LIVE_SUPABASE === '1' });
} catch (error) {
  console.error(`\n${(error as Error).message}\n`);
  process.exit(1);
}

const child = spawn('supabase', args, { stdio: 'inherit' });
child.on('error', (e: NodeJS.ErrnoException) => {
  console.error(
    e.code === 'ENOENT'
      ? 'The `supabase` CLI is not installed. Install it with: brew install supabase/tap/supabase'
      : `Could not start supabase: ${e.message}`,
  );
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
