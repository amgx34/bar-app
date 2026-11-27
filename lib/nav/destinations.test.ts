import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { destinationFor, visibleDestinations, type Destination } from './destinations';
import type { Role } from '../permissions';

/**
 * The assignment in docs/superpowers/findings/navigation-validation.md, one row
 * per page in route-inventory.md. The inventory is parsed below, so a page added
 * there without a row here fails loudly instead of resolving to null unnoticed.
 */
const EXPECTED: Record<string, Destination> = {
  '/': 'outside',
  '/accept-terms': 'outside',
  '/accessibility': 'outside',
  '/app/analytics': 'stock',
  '/app/books': 'books',
  '/app/dashboard': 'today',
  '/app/employees': 'team-pay',
  '/app/inventory': 'stock',
  '/app/inventory/analytics': 'stock',
  '/app/inventory/loss': 'stock',
  '/app/inventory/setup': 'stock',
  '/app/inventory/shipments': 'stock',
  '/app/inventory/weigh': 'stock',
  '/app/no-access': 'outside',
  '/app/payroll': 'team-pay',
  '/app/payroll/direct-deposit': 'team-pay',
  '/app/payroll/employees': 'team-pay',
  '/app/payroll/review': 'team-pay',
  '/app/payroll/split': 'team-pay',
  '/app/reps': 'stock',
  '/app/sales': 'sales',
  '/app/sales/categories': 'sales',
  '/app/sales/margins': 'sales',
  '/app/settings': 'profile',
  '/app/tax': 'team-pay',
  '/app/tips': 'team-pay',
  '/eula': 'outside',
  '/join': 'outside',
  '/login': 'outside',
  '/me': 'staff',
  '/me/pending': 'staff',
  '/privacy': 'outside',
  '/setup': 'outside',
  '/setup/pos': 'outside',
  '/setup/pos/clover': 'outside',
  '/terms': 'outside',
  '/thank-you': 'outside',
};

function inventoryPages(): string[] {
  const md = readFileSync(
    join(__dirname, '../../docs/superpowers/findings/route-inventory.md'),
    'utf8',
  );
  const pages = md.split('## API routes')[0];
  return [...pages.matchAll(/^\| `([^`]+)` \| page \|/gm)].map((m) => m[1]);
}

describe('destinationFor', () => {
  it('reads a plausible number of pages from the inventory', () => {
    expect(inventoryPages().length).toBeGreaterThanOrEqual(37);
  });

  it('has an assignment for every inventory page, and none for a page that is gone', () => {
    const pages = inventoryPages().filter((p) => !p.includes('['));
    expect(pages.filter((p) => !(p in EXPECTED))).toEqual([]);
    expect(Object.keys(EXPECTED).filter((p) => !pages.includes(p))).toEqual([]);
  });

  it.each(Object.entries(EXPECTED))('%s resolves to %s', (path, dest) => {
    expect(destinationFor(path)).toBe(dest);
  });

  it('puts the contested routes where the plan says', () => {
    expect(destinationFor('/app/inventory/shipments')).toBe('stock');
    expect(destinationFor('/app/reps')).toBe('stock');
    expect(destinationFor('/app/tips')).toBe('team-pay');
    expect(destinationFor('/app/tax')).toBe('team-pay');
    expect(destinationFor('/app/settings')).toBe('profile');
    expect(destinationFor('/me/pending')).toBe('staff');
  });

  it('sends each redirect stub to the destination of its target', () => {
    expect(destinationFor('/app/employees')).toBe(destinationFor('/app/payroll/employees'));
    expect(destinationFor('/app/analytics')).toBe(destinationFor('/app/inventory/analytics'));
    expect(destinationFor('/app/payroll/split')).toBe(destinationFor('/app/payroll'));
    expect(destinationFor('/app/inventory/loss')).toBe(destinationFor('/app/inventory'));
    expect(destinationFor('/app/sales/categories')).toBe(destinationFor('/app/sales'));
    expect(destinationFor('/app/sales/margins')).toBe(destinationFor('/app/sales'));
  });

  it('ignores query strings, fragments and trailing slashes', () => {
    expect(destinationFor('/app/payroll?view=day&date=2026-11-01')).toBe('team-pay');
    expect(destinationFor('/app/reps/')).toBe('stock');
    expect(destinationFor('/app/tips/?tab=well#top')).toBe('team-pay');
    expect(destinationFor('/app/inventory/')).toBe('stock');
  });

  it('matches children by the longest route prefix, on segment boundaries', () => {
    expect(destinationFor('/app/inventory/weigh/some-report-id')).toBe('stock');
    expect(destinationFor('/app/payroll/review/extra')).toBe('team-pay');
    // "/app/salesforce" is not a child of "/app/sales".
    expect(destinationFor('/app/salesforce')).toBeNull();
    expect(destinationFor('/app/payrolls')).toBeNull();
  });

  it('returns null for an unknown path and never throws', () => {
    for (const p of ['/nope', '/app', '/app/unknown', '/api/demo', '', '   ', '//', '/app//reps']) {
      expect(() => destinationFor(p)).not.toThrow();
    }
    expect(destinationFor('/nope')).toBeNull();
    expect(destinationFor('/app/unknown')).toBeNull();
    expect(destinationFor('')).toBeNull();
    // @ts-expect-error a caller outside the type system
    expect(destinationFor(undefined)).toBeNull();
  });
});

describe('visibleDestinations', () => {
  const roles: Role[] = ['owner', 'manager', 'accountant'];
  const FIVE = ['today', 'stock', 'sales', 'team-pay', 'books'];

  it.each(roles)('is never empty for %s', (role) => {
    expect(visibleDestinations(role).length).toBeGreaterThan(0);
  });

  // No page-level role gate exists today: every function in lib/permissions.tsx
  // gates an action, so every role can open every destination.
  it.each(roles)('shows all five destinations to %s', (role) => {
    expect(visibleDestinations(role)).toEqual(FIVE);
  });
});
