import type { Role } from '../permissions';

/**
 * The five-destination navigation as data. NOT WIRED into any component: the
 * sidebar, bottom bar and tabs still read app/(app)/app/_components/nav-config.ts.
 * The assignment and its reasons are in
 * docs/superpowers/findings/navigation-validation.md.
 */
export type Destination =
  | 'today' | 'stock' | 'sales' | 'team-pay' | 'books'
  | 'profile'   // the profile menu (Settings)
  | 'staff'     // the /me staff portal, kept separate
  | 'outside';  // public, legal, auth, onboarding: not in the app shell

/** URLs never change; a child path inherits its parent's destination. */
const ROUTES: Record<string, Destination> = {
  '/app/dashboard': 'today',

  '/app/inventory': 'stock',
  '/app/reps': 'stock', // Ordering tab; the spec had it in the profile menu
  '/app/analytics': 'stock', // redirect stub -> /app/inventory/analytics

  '/app/sales': 'sales',

  '/app/payroll': 'team-pay',
  '/app/employees': 'team-pay', // redirect stub -> /app/payroll/employees
  '/app/tips': 'team-pay',
  '/app/tax': 'team-pay',

  '/app/books': 'books',

  '/app/settings': 'profile',

  '/me': 'staff',

  '/app/no-access': 'outside',
  '/accept-terms': 'outside',
  '/accessibility': 'outside',
  '/eula': 'outside',
  '/privacy': 'outside',
  '/terms': 'outside',
  '/thank-you': 'outside',
  '/join': 'outside',
  '/login': 'outside',
  '/setup': 'outside',
};

/** "/" matches only itself; as a prefix it would claim every path. */
const ROOT: Destination = 'outside';

// shortcut: scans the table per call (about 20 entries), upgrade if it is ever called per render in a long list.
export function destinationFor(path: string): Destination | null {
  if (typeof path !== 'string') return null;
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || (path.startsWith('/') ? '/' : '');
  if (clean === '/') return ROOT;
  if (!clean.startsWith('/')) return null;

  let best: string | null = null;
  for (const route of Object.keys(ROUTES)) {
    if ((clean === route || clean.startsWith(route + '/')) && (!best || route.length > best.length)) {
      best = route;
    }
  }
  return best ? ROUTES[best] : null;
}

const FIVE = ['today', 'stock', 'sales', 'team-pay', 'books'] as const;

/**
 * A destination is hidden from a role only if that role can use nothing in it.
 *
 * No page has a role gate: every function in lib/permissions.tsx gates an
 * action (edit, adjust, submit, approve), and each destination holds screens
 * that every role can open and read (PRODUCT principle 5: roles gate actions,
 * not understanding). So nothing is derivable as hidden today and all five show.
 *
 * OWNER TO CONFIRM: whether an accountant should see Stock, where every action
 * is gated to owner or manager and the role can only read. Reading counts as
 * use here, so Stock stays visible.
 */
export function visibleDestinations(role: Role): Destination[] {
  void role; // no page-level gate exists to branch on; see above
  return [...FIVE];
}
