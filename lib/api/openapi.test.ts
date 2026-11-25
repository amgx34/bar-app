/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at untyped JSON */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildOpenApiDocument } from './openapi';
import { API_OPERATIONS } from './contract';

const FILE = join(process.cwd(), 'docs/api/openapi.json');
const doc = buildOpenApiDocument() as any;
const text = JSON.stringify(doc, null, 2) + '\n';

describe('openapi document', () => {
  // UPDATE_OPENAPI=1 npm test -- lib/api/openapi.test.ts rewrites the committed file.
  it('matches the committed docs/api/openapi.json byte for byte', () => {
    if (process.env.UPDATE_OPENAPI === '1') writeFileSync(FILE, text);
    expect(readFileSync(FILE, 'utf8')).toBe(text);
  });

  it('is 3.1.0 with a bearer scheme and the header components', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.components.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
    for (const h of ['XRailOrg', 'IdempotencyKey', 'XRequestId']) expect(doc.components.parameters[h] ?? doc.components.headers[h]).toBeDefined();
    expect(doc.servers.length).toBeGreaterThan(0);
  });

  it('every $ref resolves inside the document', () => {
    const refs: string[] = [];
    (function walk(v: unknown) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === '$ref') refs.push(x as string); else walk(x); }
    })(doc);
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) {
      expect(r.startsWith('#/')).toBe(true);
      let cur: any = doc;
      for (const part of r.slice(2).split('/')) cur = cur?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
      expect(cur, r).toBeDefined();
    }
  });

  it('every operation has a success and the standard errors; paths are /api/v1', () => {
    const paths = Object.entries(doc.paths) as [string, any][];
    expect(paths.length).toBe(new Set(API_OPERATIONS.map((o) => o.path)).size);
    expect(doc.paths['/api/v1/me'].get['x-status']).toBe('implemented');
    for (const [p, item] of paths) {
      expect(p.startsWith('/api/v1/')).toBe(true);
      for (const op of Object.values(item) as any[]) {
        const codes = Object.keys(op.responses);
        expect(codes.some((c) => c.startsWith('2'))).toBe(true);
        for (const c of ['401', '429', '500']) if (op.security?.length) expect(codes).toContain(c);
        for (const c of ['429', '500']) expect(codes).toContain(c);
        expect(['implemented', 'contract-only']).toContain(op['x-status']);
        if (op.security?.length) expect(op.security).toEqual([{ bearer: [] }]);
      }
    }
  });

  it('auth routes are contract-only; me is bearer', () => {
    expect(doc.paths['/api/v1/auth/login'].post['x-status']).toBe('contract-only');
    expect(doc.paths['/api/v1/auth/refresh'].post['x-status']).toBe('contract-only');
    expect(doc.paths['/api/v1/auth/logout'].post['x-status']).toBe('contract-only');
    expect(doc.paths['/api/v1/me'].get.security).toEqual([{ bearer: [] }]);
    expect(doc.paths['/api/v1/auth/login'].post.security).toEqual([]);
  });
});
