export type RouteEntry = {
  /** URL path as the router sees it, route groups removed. Dynamic segments stay in brackets. */
  path: string;
  kind: 'page' | 'api';
  group: 'public' | 'auth' | 'app' | 'staff';
  /** True when the URL cannot be visited without choosing a real value for a segment. */
  needsParams: boolean;
};

const GROUPS = new Set(['app', 'auth', 'staff']);
const PAGE = /^page\.(tsx|ts|jsx|js)$/;
const ROUTE = /^route\.(ts|js)$/;

/**
 * Turns file paths under `app/` into the routes Next serves from them.
 * Input paths are relative to the repo root; either slash style is accepted.
 * Private folders (`_x`), parallel slots (`@x`) and intercepting routes
 * (`(.)x`, `(..)x`) serve nothing on their own and are dropped.
 */
export function routesFromFiles(files: string[]): RouteEntry[] {
  const out: RouteEntry[] = [];
  for (const raw of files) {
    const parts = raw.replace(/\\/g, '/').split('/');
    if (parts[0] !== 'app') continue;
    const name = parts[parts.length - 1];
    const kind = PAGE.test(name) ? 'page' : ROUTE.test(name) ? 'api' : null;
    if (!kind) continue;

    const dirs = parts.slice(1, -1);
    if (dirs.some((d) => d.startsWith('_') || d.startsWith('@') || /^\(\.{1,3}\)/.test(d))) continue;

    let group: RouteEntry['group'] = 'public';
    const segments: string[] = [];
    for (const d of dirs) {
      const g = d.match(/^\((.+)\)$/);
      if (g) {
        if (GROUPS.has(g[1])) group = g[1] as RouteEntry['group'];
      } else {
        segments.push(d);
      }
    }

    out.push({
      path: `/${segments.join('/')}`,
      kind,
      group,
      needsParams: segments.some((s) => /^\[(?!\[).*\]$/.test(s)),
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
}
