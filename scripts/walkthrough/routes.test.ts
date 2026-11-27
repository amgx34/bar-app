import { describe, it, expect } from 'vitest';
import { win32 } from 'node:path';
import { routesFromFiles } from './routes';

describe('routesFromFiles', () => {
  it('maps the root page to /', () => {
    expect(routesFromFiles(['app/page.tsx'])).toEqual([
      { path: '/', kind: 'page', group: 'public', needsParams: false },
    ]);
  });

  it('strips route groups from the path and derives the group from them', () => {
    const r = routesFromFiles([
      'app/(app)/app/payroll/page.tsx',
      'app/(auth)/login/page.tsx',
      'app/(staff)/me/page.tsx',
      'app/privacy/page.tsx',
    ]);
    expect(r.map((x) => [x.path, x.group])).toEqual([
      ['/app/payroll', 'app'],
      ['/login', 'auth'],
      ['/me', 'staff'],
      ['/privacy', 'public'],
    ]);
  });

  it('treats a route group it does not know as public', () => {
    expect(routesFromFiles(['app/(marketing)/pricing/page.tsx'])[0]).toMatchObject({ path: '/pricing', group: 'public' });
  });

  it('classifies route.ts as an api route', () => {
    expect(routesFromFiles(['app/api/demo/route.ts'])[0]).toMatchObject({ path: '/api/demo', kind: 'api' });
  });

  it('flags dynamic and catch-all segments as needing params, but not an optional catch-all', () => {
    const r = routesFromFiles([
      'app/(app)/app/x/[id]/page.tsx',
      'app/docs/[...slug]/page.tsx',
      'app/help/[[...slug]]/page.tsx',
    ]);
    const byPath = Object.fromEntries(r.map((x) => [x.path, x.needsParams]));
    expect(byPath['/app/x/[id]']).toBe(true);
    expect(byPath['/docs/[...slug]']).toBe(true);
    expect(byPath['/help/[[...slug]]']).toBe(false);
  });

  it('drops private folders, parallel slots, intercepting routes and files that are not routes', () => {
    const r = routesFromFiles([
      'app/(app)/app/payroll/_components/thing.tsx',
      'app/_components/landing/page.tsx',
      'app/@modal/login/page.tsx',
      'app/photos/(.)detail/page.tsx',
      'app/photos/(..)feed/page.tsx',
      'app/(app)/app/payroll/layout.tsx',
      'app/(app)/app/payroll/actions.ts',
      'app/(app)/app/payroll/loading.tsx',
      'lib/page.tsx',
    ]);
    expect(r).toEqual([]);
  });

  it('sorts by path', () => {
    const r = routesFromFiles(['app/terms/page.tsx', 'app/page.tsx', 'app/eula/page.tsx']);
    expect(r.map((x) => x.path)).toEqual(['/', '/eula', '/terms']);
  });

  it('accepts Windows path separators', () => {
    const S = win32.sep;
    const r = routesFromFiles([['app', '(app)', 'app', 'tips', 'page.tsx'].join(S)]);
    expect(r[0]).toMatchObject({ path: '/app/tips', group: 'app' });
  });
});
