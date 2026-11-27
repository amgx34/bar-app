import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Owner-facing copy: no em dashes, no developer wording, one place for the support address.
const sources = (p: string): string[] =>
  statSync(p).isDirectory()
    ? readdirSync(p).flatMap((f) => sources(join(p, f)))
    : /\.tsx?$/.test(p) && !p.includes('.test.') ? [p] : [];

const code = (p: string) =>
  readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

const NO_EM_DASH = [
  'app/page.tsx', 'app/layout.tsx', 'app/opengraph-image.tsx', 'app/thank-you', 'app/_components/landing',
  'app/(app)/app/books', 'lib/books', 'app/(app)/app/tax', 'app/(app)/app/payroll/review', 'lib/payroll/open-run.ts',
  'app/(app)/setup', 'app/(app)/app/settings/_components/pos-panel.tsx', 'app/(auth)/join',
];

describe('owner-facing copy', () => {
  it('has no em dashes on the named screens', () => {
    const hits = NO_EM_DASH.flatMap(sources).filter((f) => /—|&mdash;|\\u2014/.test(code(f)));
    expect(hits).toEqual([]);
  });
  it('never prints environment variable names on the POS connect screens', () => {
    const files = [
      'app/(app)/setup/pos/clover/page.tsx', 'app/(app)/setup/pos/toast',
      'app/(app)/app/settings/_components/pos-panel.tsx',
    ].flatMap(sources);
    for (const f of files) {
      expect(code(f).replace(/process\.env\.\w+/g, ''), f)
        .not.toMatch(/\b(CLOVER|TOAST|OAUTH)_[A-Z_]+|your environment/);
    }
  });
  it('shows the support address only through lib/support', () => {
    // contact.ts NOTIFY_TO is where demo requests are delivered, not something a user reads.
    const hits = ['app', 'lib', 'components'].flatMap(sources)
      .filter((f) => f !== 'lib/support.ts' && f !== 'app/actions/contact.ts')
      .filter((f) => code(f).includes('railsystemspos@'));
    expect(hits).toEqual([]);
  });
});
