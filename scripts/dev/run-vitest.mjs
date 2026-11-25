// Runs vitest from a working directory whose drive letter is upper-case.
// `npm test` goes through here because a lowercase `c:\...` cwd (what VS Code
// hands to its terminals) makes every test file fail to load. Config alone
// cannot fix it: the vitest process itself is already started from the
// lowercase path by the time any config is read.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { upperDriveLetter } from './drive-letter.mjs';

const root = upperDriveLetter(process.cwd());
const entry = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
