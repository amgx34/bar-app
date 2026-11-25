import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';
import { loadExport, quoteIdent, schemaToSql, type SchemaExport } from './schema-to-sql';

const empty = (over: Partial<SchemaExport> = {}): SchemaExport => ({
  enums: [],
  sequences: [],
  tables: [],
  columns: [],
  constraints: [],
  indexes: [],
  policies: [],
  functions: [],
  triggers: [],
  uncovered: [],
  ...over,
});

const col = (table: string, name: string, position: number, type: string, extra: object = {}) => ({
  table,
  name,
  position,
  type,
  notNull: false,
  default: null,
  identity: null,
  generated: null,
  ...extra,
});

describe('quoteIdent', () => {
  it('quotes reserved words', () => {
    expect(quoteIdent('order')).toBe('"order"');
  });
  it('doubles an embedded quote', () => {
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });
  it('keeps mixed case', () => {
    expect(quoteIdent('Org')).toBe('"Org"');
  });
});

describe('loadExport', () => {
  const rows = [
    { section: 'tables', payload: [{ name: 'orders', rls: true }] },
    { section: 'enums', payload: [{ name: 'size', labels: ['s', 'l'] }] },
  ];

  it('reads a JSON array of {section, payload} rows', () => {
    const e = loadExport(JSON.stringify(rows));
    expect(e.tables).toEqual([{ name: 'orders', rls: true }]);
    expect(e.enums[0].labels).toEqual(['s', 'l']);
  });

  it('reads CSV with payload as a JSON string, and matches the JSON result', () => {
    const csv = Papa.unparse(rows.map((r) => ({ section: r.section, payload: JSON.stringify(r.payload) })));
    expect(loadExport(csv)).toEqual(loadExport(JSON.stringify(rows)));
  });

  it('accepts payload already parsed or as a string inside JSON rows', () => {
    const e = loadExport(JSON.stringify([{ section: 'tables', payload: JSON.stringify([{ name: 't', rls: false }]) }]));
    expect(e.tables).toEqual([{ name: 't', rls: false }]);
  });

  it('turns a missing section into an empty array', () => {
    expect(loadExport(JSON.stringify(rows)).triggers).toEqual([]);
  });

  it('survives a leading byte-order mark', () => {
    expect(loadExport('﻿' + JSON.stringify(rows)).tables).toHaveLength(1);
  });
});

describe('schemaToSql', () => {
  const full = empty({
    functions: [
      {
        name: 'default_org()',
        definition: 'CREATE OR REPLACE FUNCTION public.default_org() RETURNS uuid LANGUAGE sql AS $$ select gen_random_uuid() $$',
      },
    ],
    tables: [
      { name: 'orders', rls: true },
      { name: 'organizations', rls: false },
    ],
    columns: [
      col('orders', 'id', 1, 'uuid', { notNull: true, default: 'gen_random_uuid()' }),
      col('orders', 'org_id', 2, 'uuid', { default: 'default_org()' }),
      col('organizations', 'id', 1, 'uuid', { notNull: true }),
    ],
    constraints: [
      { table: 'orders', name: 'orders_org_fk', kind: 'f', definition: 'FOREIGN KEY (org_id) REFERENCES organizations(id)' },
      { table: 'organizations', name: 'organizations_pkey', kind: 'p', definition: 'PRIMARY KEY (id)' },
    ],
    triggers: [
      { table: 'orders', name: 'trg', definition: 'CREATE TRIGGER trg BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.default_org()' },
    ],
    policies: [
      { table: 'orders', name: 'org_read', permissive: true, command: 'SELECT', roles: ['authenticated'], using: '(org_id = default_org())', check: null },
    ],
  });

  it('orders the statements so every dependency exists before it is used', () => {
    const sql = schemaToSql(full);
    const order = [
      'set check_function_bodies = off',
      'CREATE OR REPLACE FUNCTION',
      'CREATE TABLE',
      'FOREIGN KEY',
      'CREATE TRIGGER',
      'ENABLE ROW LEVEL SECURITY',
      'CREATE POLICY',
    ].map((s) => sql.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('creates a function that returns a table row type after that table, and the rest before', () => {
    const rowTypeFn = [
      'CREATE OR REPLACE FUNCTION public.commit_account(p_id uuid)',
      ' RETURNS accounts',
      ' LANGUAGE plpgsql',
      'AS $function$',
      'BEGIN RETURN NULL; END;',
      '$function$',
    ].join(String.fromCharCode(10));
    const sql = schemaToSql(
      empty({
        tables: [{ name: 'accounts', rls: false }],
        columns: [col('accounts', 'id', 1, 'uuid', { notNull: true, default: 'default_id()' })],
        functions: [
          {
            name: 'default_id()',
            definition: 'CREATE OR REPLACE FUNCTION public.default_id() RETURNS uuid LANGUAGE sql AS $$ select gen_random_uuid() $$',
          },
          { name: 'commit_account(p_id uuid)', definition: rowTypeFn },
        ],
      }),
    );
    const at = (s: string) => sql.indexOf(s);
    expect(at('public.default_id()')).toBeLessThan(at('CREATE TABLE'));
    expect(at('CREATE TABLE')).toBeLessThan(at('public.commit_account'));
  });

  it('does not treat a parameter named like part of a table as that table', () => {
    const sql = schemaToSql(
      empty({
        tables: [{ name: 'staff', rls: false }],
        columns: [col('staff', 'id', 1, 'uuid', { notNull: true })],
        functions: [
          {
            name: 'pay(p_staff_id uuid)',
            definition: 'CREATE OR REPLACE FUNCTION public.pay(p_staff_id uuid) RETURNS numeric LANGUAGE sql AS $$ select 1 $$',
          },
        ],
      }),
    );
    expect(sql.indexOf('public.pay(')).toBeLessThan(sql.indexOf('CREATE TABLE'));
  });

  it('puts primary keys before foreign keys that point at them', () => {
    const sql = schemaToSql(full);
    expect(sql.indexOf('PRIMARY KEY')).toBeLessThan(sql.indexOf('FOREIGN KEY'));
  });

  it('creates both tables before either foreign key when two tables reference each other', () => {
    const sql = schemaToSql(
      empty({
        tables: [
          { name: 'a', rls: false },
          { name: 'b', rls: false },
        ],
        columns: [col('a', 'b_id', 1, 'uuid'), col('b', 'a_id', 1, 'uuid')],
        constraints: [
          { table: 'a', name: 'a_b', kind: 'f', definition: 'FOREIGN KEY (b_id) REFERENCES b(a_id)' },
          { table: 'b', name: 'b_a', kind: 'f', definition: 'FOREIGN KEY (a_id) REFERENCES a(b_id)' },
        ],
      }),
    );
    const lastTable = sql.lastIndexOf('CREATE TABLE');
    const firstFk = sql.indexOf('FOREIGN KEY');
    expect(lastTable).toBeGreaterThanOrEqual(0);
    expect(lastTable).toBeLessThan(firstFk);
  });

  it('renders a read policy for one role with no WITH CHECK', () => {
    expect(schemaToSql(full)).toContain(
      'CREATE POLICY "org_read" ON "public"."orders" AS PERMISSIVE FOR SELECT TO authenticated USING ((org_id = default_org()));',
    );
    expect(schemaToSql(full)).not.toContain('WITH CHECK');
  });

  it('renders the public role as TO public, and a restrictive policy with a check', () => {
    const sql = schemaToSql(
      empty({
        tables: [{ name: 't', rls: true }],
        columns: [col('t', 'x', 1, 'int')],
        policies: [{ table: 't', name: 'p', permissive: false, command: 'ALL', roles: ['public'], using: '(x > 0)', check: '(x < 9)' }],
      }),
    );
    expect(sql).toContain('AS RESTRICTIVE FOR ALL TO public USING ((x > 0)) WITH CHECK ((x < 9));');
  });

  it('keeps function definitions byte for byte and terminates them', () => {
    const def = full.functions[0].definition;
    expect(schemaToSql(full)).toContain(def + ';');
  });

  it('does not add a second semicolon when a definition already ends with one', () => {
    const sql = schemaToSql(empty({ functions: [{ name: 'f()', definition: 'CREATE OR REPLACE FUNCTION public.f() RETURNS int LANGUAGE sql AS $$ select 1 $$;' }] }));
    expect(sql).not.toContain(';;');
  });

  it('quotes a table named after a reserved word', () => {
    const sql = schemaToSql(empty({ tables: [{ name: 'order', rls: false }], columns: [col('order', 'user', 1, 'text')] }));
    expect(sql).toContain('CREATE TABLE "public"."order"');
    expect(sql).toContain('"user" text');
  });

  it('renders identity and generated columns', () => {
    const sql = schemaToSql(
      empty({
        tables: [{ name: 't', rls: false }],
        columns: [
          col('t', 'id', 1, 'bigint', { notNull: true, identity: 'always' }),
          col('t', 'n', 2, 'int', { identity: 'by default' }),
          col('t', 'sum', 3, 'int', { generated: '(a + b)' }),
        ],
      }),
    );
    expect(sql).toContain('"id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL');
    expect(sql).toContain('"n" int GENERATED BY DEFAULT AS IDENTITY');
    expect(sql).toContain('"sum" int GENERATED ALWAYS AS ((a + b)) STORED');
  });

  it('emits columns in position order', () => {
    const sql = schemaToSql(
      empty({
        tables: [{ name: 't', rls: false }],
        columns: [col('t', 'second', 2, 'int'), col('t', 'first', 1, 'int')],
      }),
    );
    expect(sql.indexOf('"first"')).toBeLessThan(sql.indexOf('"second"'));
  });

  it('creates enums and sequences before the tables that use them', () => {
    const sql = schemaToSql(
      empty({
        enums: [{ name: 'size', labels: ["s'm", 'l'] }],
        sequences: [{ name: 't_id_seq', dataType: 'bigint' }],
        tables: [{ name: 't', rls: false }],
        columns: [col('t', 'id', 1, 'bigint', { default: "nextval('t_id_seq'::regclass)" }), col('t', 's', 2, 'size')],
      }),
    );
    expect(sql).toContain(`CREATE TYPE "public"."size" AS ENUM ('s''m', 'l');`);
    expect(sql).toContain('CREATE SEQUENCE "public"."t_id_seq" AS bigint;');
    expect(sql.indexOf('CREATE TYPE')).toBeLessThan(sql.indexOf('CREATE TABLE'));
    expect(sql.indexOf('CREATE SEQUENCE')).toBeLessThan(sql.indexOf('CREATE TABLE'));
  });
});
