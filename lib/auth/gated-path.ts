/**
 * Paths that need a signed-in user. Boundary-aware: a bare startsWith('/app')
 * also matches /apple-icon, startsWith('/me') matches /menu, and startsWith('/setup')
 * matches /setup-guide, which is public.
 */
const GATED_ROOTS = ['/app', '/me', '/setup'];

export function isGatedPath(pathname: string): boolean {
  return GATED_ROOTS.some((r) => pathname === r || pathname.startsWith(r + '/'));
}
