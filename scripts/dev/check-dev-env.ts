// Runs before `npm run dev` (npm's `predev`). Exits 1 if the dev server would
// talk to the same Supabase project as .env.local, which is treated as live.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nextEnv from '@next/env';
import { assertDevIsNotLive, normalizeHost, readEnvValue } from './live-guard.ts';

const root = process.cwd();
// Same loading order `next dev` uses: .env.development.local wins over .env.local.
nextEnv.loadEnvConfig(root, true);

const devUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const localFile = resolve(root, '.env.local');
const liveUrl = existsSync(localFile)
  ? readEnvValue(readFileSync(localFile, 'utf8'), 'NEXT_PUBLIC_SUPABASE_URL')
  : undefined;

try {
  assertDevIsNotLive(devUrl, liveUrl, process.env.RAIL_ALLOW_LIVE_DEV === '1');
} catch (error) {
  console.error(`\n${(error as Error).message}\n`);
  process.exit(1);
}
console.log(`dev server will use Supabase host: ${normalizeHost(devUrl as string)}`);
