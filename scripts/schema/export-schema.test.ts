import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SQL = readFileSync(new URL('../../supabase/diagnostics/export-schema.sql', import.meta.url), 'utf8');

/** The SQL with comments and string literals removed, so only statements remain. */
function code(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
}

const SECTIONS = [
  'enums',
  'sequences',
  'tables',
  'columns',
  'constraints',
  'indexes',
  'policies',
  'functions',
  'triggers',
  'uncovered',
];

describe('export-schema.sql', () => {
  it('is read-only: one SELECT, no write or DDL verbs', () => {
    const c = code(SQL).trim();
    expect(c).toMatch(/^select\b/i);
    expect(c).not.toMatch(
      /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|call|do|vacuum|reindex|refresh|lock)\b/i,
    );
    expect((c.match(/;/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it('returns one row per section', () => {
    for (const name of SECTIONS) {
      expect(SQL, `section ${name}`).toContain(`'${name}'`);
    }
  });

  it('reads only system catalogs, never an application table', () => {
    const c = code(SQL);
    const sources = [...c.matchAll(/\b(?:from|join)\s+([a-z_."]+)/gi)].map((m) => m[1].toLowerCase());
    expect(sources.length).toBeGreaterThan(5);
    for (const s of sources) {
      expect(s, `reads from ${s}`).toMatch(/^(pg_catalog\.)?pg_[a-z_]+$/);
    }
  });
});
