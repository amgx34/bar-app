import { describe, it, expect } from 'vitest';
import type { createAdminClient } from '@/lib/supabase/admin';
import { createFakeAdmin, type Call, type QueryCall } from '@/lib/test/fake-admin';
import { applyNormalized } from './ingest';
import type { NormalizedPayload } from './normalized';

const base: NormalizedPayload = { source: 'test', pulledAt: '2026-11-21T00:00:00Z', zReports: [], ewReports: [], itemAudit: [] };

async function run(zReports: NormalizedPayload['zReports'], manual: string[] = []) {
  const fake = createFakeAdmin((c) =>
    'table' in c && c.table === 'z_report_days' && c.op === 'select'
      ? { data: manual.map((d) => ({ report_date: d, cash_tips: 55, cash_tips_source: 'manual' })) }
      : undefined);
  const result = await applyNormalized(
    fake.client as unknown as ReturnType<typeof createAdminClient>,
    'org-1',
    { ...base, zReports },
    { barSettings: {}, errorPrefix: 'api: ' },
  );
  const upserts = fake.calls.filter((c: Call): c is QueryCall => 'table' in c && c.op === 'upsert');
  return { result, upserts, rows: upserts.map((u) => u.payload as Record<string, unknown>[]) };
}

describe('applyNormalized, cash tips', () => {
  it('an absent cash_tips omits both columns so a stored figure is untouched', async () => {
    const { rows, result } = await run([{ report_date: '2026-11-20', total_sales: 100, cc_tips: 5 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).not.toHaveProperty('cash_tips');
    expect(rows[0][0]).not.toHaveProperty('cash_tips_source');
    expect(rows[0][0]).toMatchObject({ cash_sales: null, card_sales: null });
    expect(result.zReports).toBe(1);
  });

  it('a reported zero is written, because zero is an answer', async () => {
    const { rows } = await run([{ report_date: '2026-11-20', total_sales: 100, cc_tips: 5, cash_tips: 0 }]);
    expect(rows[0][0]).toMatchObject({ cash_tips: 0, cash_tips_source: 'pos' });
  });

  it('a manual night keeps its figure when the source reports one', async () => {
    const { rows } = await run([{ report_date: '2026-11-20', total_sales: 100, cc_tips: 5, cash_tips: 0 }], ['2026-11-20']);
    expect(rows[0][0]).toMatchObject({ cash_tips: 55, cash_tips_source: 'manual' });
  });

  it('reported and unreported nights never share one statement', async () => {
    const { rows } = await run([
      { report_date: '2026-11-20', total_sales: 100, cc_tips: 5, cash_tips: 3 },
      { report_date: '2026-11-21', total_sales: 100, cc_tips: 5 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(1);
    expect(rows[0][0]).toHaveProperty('cash_tips', 3);
    expect(rows[1][0]).not.toHaveProperty('cash_tips');
  });
});

describe('applyNormalized, source errors', () => {
  it('prefixes, caps at five and truncates to 300 characters', async () => {
    const fake = createFakeAdmin();
    const r = await applyNormalized(
      fake.client as unknown as ReturnType<typeof createAdminClient>,
      'org-1',
      { ...base, errors: Array.from({ length: 7 }, () => 'y'.repeat(400)) },
      { barSettings: {}, errorPrefix: 'api: ' },
    );
    expect(r.errors).toHaveLength(5);
    expect(r.errors[0]).toBe(`api: ${'y'.repeat(300)}`);
  });
});
