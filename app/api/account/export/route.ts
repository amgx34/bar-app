import { NextResponse } from 'next/server';
import { getCurrentOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { EXPORT_TABLES } from '@/lib/account/deletion-plan';
import { toCsv } from '@/lib/account/csv';
import { zipStore } from '@/lib/account/zip';

export const dynamic = 'force-dynamic';

const PAGE = 1000;

async function all(q: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if ((data?.length ?? 0) < PAGE) return rows;
  }
}

/**
 * The owner's data as a zip of CSVs. Uses the cookie client, so RLS applies on top
 * of the explicit organization filter. Secrets (bank details, POS tokens, devices)
 * are not in EXPORT_TABLES. A table missing from this database is skipped and named
 * in README.txt rather than failing the whole download.
 */
export async function GET() {
  const { org, role } = await getCurrentOrg();
  if (role !== 'owner') return NextResponse.json({ error: 'Only the owner can export' }, { status: 403 });

  const supabase = await createClient();
  const files: { name: string; data: string }[] = [];
  const skipped: string[] = [];

  const orgRows = await all((a, b) => supabase.from('organizations')
    .select('id, name, slug, bar_settings, created_at').eq('id', org.id).range(a, b));
  files.push({ name: 'organization.csv', data: toCsv(orgRows) });

  const parentIds = new Map<string, string[]>();
  for (const t of EXPORT_TABLES) {
    try {
      let rows: Record<string, unknown>[];
      if (t.via === 'org') {
        rows = await all((a, b) => supabase.from(t.table).select('*').eq('organization_id', org.id).order('id').range(a, b));
      } else {
        const ids = parentIds.get(t.parent!) ?? [];
        rows = [];
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          rows.push(...await all((a, b) => supabase.from(t.table).select('*').in(t.parentKey!, chunk).order('id').range(a, b)));
        }
      }
      if (EXPORT_TABLES.some((c) => c.parent === t.table)) parentIds.set(t.table, rows.map((r) => String(r.id)));
      files.push({ name: `${t.table}.csv`, data: toCsv(rows) });
    } catch (e) {
      skipped.push(`${t.table}: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }

  files.unshift({
    name: 'README.txt',
    data: [
      `Rail export for ${org.name}`,
      `Created ${new Date().toISOString()}`,
      '',
      'One CSV per table. Money columns are in the units the app stores them.',
      'Not included: bank account details, POS credentials, push devices, alerts, sign-in records.',
      skipped.length ? `\nCould not read (not in this database or access refused):\n${skipped.join('\n')}` : '',
    ].join('\n'),
  });

  console.info('[account] export', { orgId: org.id, tables: files.length, skipped: skipped.length });
  const day = new Date().toISOString().slice(0, 10);
  const slug = org.slug.replace(/[^a-z0-9-]/gi, '');
  return new NextResponse(new Uint8Array(zipStore(files)), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="rail-export-${slug}-${day}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
