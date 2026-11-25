// `npm run audit:tokens`: checks WCAG contrast of the documented token pairs in
// app/globals.css, light and dark. Exits 1 on any failure.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type Pair = { fgName: string; bgName: string; fg: string; bg: string; kind: 'text' | 'ui' };
export type Failure = { fgName: string; bgName: string; ratio: number; required: number };

function luminance(hex: string): number {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Every pair under its threshold: 4.5 for text, 3 for UI edges and chart marks. */
export function checkPairs(pairs: Pair[]): Failure[] {
  const out: Failure[] = [];
  for (const p of pairs) {
    const required = p.kind === 'text' ? 4.5 : 3;
    const ratio = contrastRatio(p.fg, p.bg);
    if (ratio < required) out.push({ fgName: p.fgName, bgName: p.bgName, ratio, required });
  }
  return out;
}

type TokenMap = Record<string, string>;

function block(css: string, selector: RegExp): TokenMap {
  // shortcut: first top-level block only, assumes no nested braces; the print
  // override inside @media is indented so `^` skips it.
  const body = css.match(selector)?.[1] ?? '';
  const map: TokenMap = {};
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    map[m[1]] = m[2].trim();
  }
  return map;
}

export function parseTokens(css: string): { light: TokenMap; dark: TokenMap } {
  return {
    light: block(css, /^:root\s*\{([^}]*)\}/m),
    dark: block(css, /^\.dark\s*\{([^}]*)\}/m),
  };
}

/** Follows var(--x) chains; throws naming the token if missing or not hex. */
export function resolveHex(map: TokenMap, name: string, depth = 0): string {
  const v = map[name];
  if (v === undefined) throw new Error(`token --${name} is missing`);
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  if (ref && depth < 10) return resolveHex(map, ref[1], depth + 1);
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) throw new Error(`--${name} is not a plain hex value (${v})`);
  return v;
}

const T = 'text' as const;
const U = 'ui' as const;
const SPEC: [string, string, 'text' | 'ui'][] = [
  ['foreground', 'background', T], ['card-foreground', 'card', T], ['popover-foreground', 'popover', T],
  ['primary-foreground', 'primary', T], ['secondary-foreground', 'secondary', T],
  ['muted-foreground', 'background', T], ['muted-foreground', 'card', T], ['muted-foreground', 'muted', T],
  ['accent-foreground', 'accent', T], ['cta-foreground', 'cta', T],
  ['accent-text', 'background', T], ['accent-text', 'card', T],
  ['destructive-foreground', 'destructive', T], ['destructive', 'background', T], ['destructive', 'card', T],
  ['sidebar-foreground', 'sidebar', T], ['sidebar-primary', 'sidebar', T],
  ['sidebar-accent-foreground', 'sidebar-accent', T],
  ['border-strong', 'card', U], ['border-strong', 'background', U], ['input', 'card', U],
  ['input', 'background', U], ['ring', 'card', U],
  ...[1, 2, 3, 4, 5].map((n): [string, string, 'ui'] => [`chart-${n}`, 'card', U]),
];

function main() {
  const themes = parseTokens(readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8'));
  let failed = 0;
  for (const theme of ['light', 'dark'] as const) {
    const map = themes[theme];
    const pairs: Pair[] = [];
    for (const [fgName, bgName, kind] of SPEC) {
      try {
        pairs.push({ fgName, bgName, kind, fg: resolveHex(map, fgName), bg: resolveHex(map, bgName) });
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes('missing')) { console.error(`[${theme}] ${fgName} on ${bgName}: ${msg}`); failed++; }
        else console.log(`[${theme}] ${fgName} on ${bgName}: not checked, ${msg}`);
      }
    }
    const fails = checkPairs(pairs);
    for (const f of fails) {
      console.error(`FAIL [${theme}] ${f.fgName} on ${f.bgName}: ${f.ratio.toFixed(2)}:1, needs ${f.required}:1`);
    }
    failed += fails.length;
    console.log(`${theme}: ${pairs.length - fails.length}/${pairs.length} pairs pass`);
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
