#!/usr/bin/env node
/**
 * PostToolUse hook: lint the single file Claude just wrote.
 *
 * Written in Node rather than the usual `jq` one-liner because jq is not
 * installed on this machine — a jq-based hook would silently no-op.
 *
 * Reports findings back as additionalContext instead of blocking: the point is
 * that Claude sees its own lint errors immediately rather than at the end of a
 * long edit sequence. Non-TS files and clean files produce no output at all.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const MAX_OUTPUT = 4000; // keep a noisy file from flooding the context

function readStdin() {
  return new Promise(resolve => {
    let s = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => (s += d));
    process.stdin.on('end', () => resolve(s));
    // If nothing is piped in, don't hang the turn.
    setTimeout(() => resolve(s), 2000).unref?.();
  });
}

const raw = await readStdin();

let file = '';
try {
  const evt = JSON.parse(raw || '{}');
  file = evt?.tool_response?.filePath || evt?.tool_input?.file_path || '';
} catch {
  process.exit(0); // malformed payload: fail open, never block the turn
}

if (!file || !/\.(ts|tsx|mts|cts)$/.test(file) || !existsSync(file)) process.exit(0);

// Run eslint's JS entry with this same Node binary rather than `npx`. On
// Windows, Node 24 refuses to spawn `npx.cmd` without a shell (spawn EINVAL),
// and going through a shell would mean quoting a user-controlled path.
const eslintBin = join(process.cwd(), 'node_modules', 'eslint', 'bin', 'eslint.js');
if (!existsSync(eslintBin)) process.exit(0); // deps not installed: nothing to do

// Default (stylish) formatter on purpose — `compact` was removed from core
// ESLint and asking for it makes eslint exit before linting anything, which a
// stdout-only check would silently read as "file is clean".
execFile(
  process.execPath,
  [eslintBin, file],
  { cwd: process.cwd(), timeout: 60_000, windowsHide: true },
  (_err, stdout) => {
    // eslint prints nothing at all when a file is clean.
    const out = (stdout || '').trim();
    if (!out) process.exit(0);

    // Exit 2 is the signal that wakes the model when this runs as an
    // asyncRewake hook; the text below is what it gets shown.
    process.stdout.write(`ESLint findings in ${file}:\n${out.slice(0, MAX_OUTPUT)}\n`);
    process.exit(2);
  },
);
