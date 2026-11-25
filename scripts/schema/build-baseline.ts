// Usage: node scripts/schema/build-baseline.ts <export.csv|export.json>
// Reads the result of supabase/diagnostics/export-schema.sql and writes
// supabase/schema-export/baseline.sql, SQL that recreates that structure in an
// empty Supabase project. Makes no network or database connection.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadExport, schemaToSql, tablesWithoutRls } from './schema-to-sql.ts';

const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/schema/build-baseline.ts <export.csv|export.json>');
  process.exit(2);
}

const exported = loadExport(readFileSync(input, 'utf8'));
if (exported.tables.length === 0) {
  console.error('The export has no tables. Wrong file, or the query was run against an empty schema.');
  process.exit(1);
}

const sql = schemaToSql(exported);
const created = (sql.match(/^CREATE TABLE /gm) ?? []).length;
if (created !== exported.tables.length) {
  console.error(`Export lists ${exported.tables.length} tables but the baseline creates ${created}.`);
  process.exit(1);
}

const out = resolve('supabase/schema-export/baseline.sql');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, sql);

console.log(`wrote ${out}`);
console.log(
  `tables ${created} | columns ${exported.columns.length} | constraints ${exported.constraints.length} | ` +
    `indexes ${exported.indexes.length} | policies ${exported.policies.length} | ` +
    `functions ${exported.functions.length} | triggers ${exported.triggers.length} | ` +
    `enums ${exported.enums.length} | sequences ${exported.sequences.length}`,
);
const unprotected = tablesWithoutRls(exported);
if (unprotected.length > 0) {
  console.warn(
    `\nROW LEVEL SECURITY IS OFF on ${unprotected.length} table(s). The baseline copies that faithfully; it does not fix it.\n` +
      '  Whether the public API can reach them depends on table grants, which this export does not contain.\n' +
      `  ${unprotected.join(', ')}`,
  );
}
if (exported.uncovered.length > 0) {
  console.warn('\nNOT recreated by this baseline (add by hand if the app needs them):');
  for (const u of exported.uncovered) console.warn(`  ${u.kind}: ${u.name}`);
}
