'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';
import { canManagePayroll } from '@/lib/permissions';

/**
 * Recording the cash tips counted at the end of a night.
 *
 * The POS knows what went through a card reader. It does not know what came out
 * of the jar, so cash tips are counted by hand and entered here — and until they
 * are, every tip split for that night is short by exactly that amount.
 *
 * Writes z_report_days.cash_tips, which is the same field the agent and the Z
 * report importer populate. There is one figure per night, not one per source,
 * so entering it by hand and importing it later cannot disagree.
 */

const cashTipsSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  // Generous but bounded: a busy night is hundreds, and five figures of cash
  // tips is a misplaced decimal point rather than a good night.
  cashTips: z.number().min(0, 'Cannot be negative').max(100000),
});

export type NightCash = {
  reportDate: string;
  cashTips: number;
  ccTips: number;
  totalSales: number;
  /**
   * How the night was tendered. Null means the POS did not report the split —
   * an older agent, an emailed Z report, or a night before the feature existed.
   * Null is not zero, and the UI shows nothing rather than a made-up figure.
   */
  cashSales: number | null;
  cardSales: number | null;
  /** True once a person has counted and entered the cash tips by hand. */
  cashTipsCounted: boolean;
  /** False when no Z report exists for the night yet. */
  hasZReport: boolean;
  /** Cash a person counted in the drawer. Null: not counted, or the column is not migrated yet. */
  countedCash: number | null;
  /** False until the counted_cash migration is applied; the tie-out then says so. */
  countedCashAvailable: boolean;
};

/** What is currently recorded for one night. */
export async function getNightCash(reportDate: string): Promise<NightCash> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const cols = 'report_date, cash_tips, cc_tips, total_sales, cash_sales, card_sales, cash_tips_source';
  const fetchNight = (select: string) => supabase
    .from('z_report_days')
    .select(select)
    .eq('organization_id', org.id)
    .eq('report_date', reportDate)
    .maybeSingle();

  // counted_cash arrives with a migration; until it is applied the first query
  // errors, and the screen must still load without it.
  let countedCashAvailable = true;
  let res = await fetchNight(`${cols}, counted_cash`);
  if (res.error) {
    countedCashAvailable = false;
    res = await fetchNight(cols);
  }
  const data = res.data as unknown as Record<string, number | string | null> | null;

  return {
    reportDate,
    cashTips: Number(data?.cash_tips) || 0,
    ccTips: Number(data?.cc_tips) || 0,
    totalSales: Number(data?.total_sales) || 0,
    // == null keeps a reported 0 as 0 and only an absent figure as null.
    cashSales: data?.cash_sales == null ? null : Number(data.cash_sales),
    cardSales: data?.card_sales == null ? null : Number(data.card_sales),
    cashTipsCounted: data?.cash_tips_source === 'manual',
    hasZReport: Boolean(data),
    countedCash: data?.counted_cash == null ? null : Number(data.counted_cash),
    countedCashAvailable,
  };
}

/**
 * Sets the cash tips for a night.
 *
 * Sets rather than adds: this is the counted total, and an operator correcting
 * a miscount would otherwise double it. The current figure is shown alongside
 * the field so the replacement is deliberate.
 *
 * Creates the night's row when the Z report has not arrived yet — a bar that
 * counts its jar before the POS is closed out should not have to wait, and the
 * agent's later upsert only touches the columns it owns.
 */
export async function logCashTips(raw: unknown): Promise<NightCash> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not authorized');

  const input = cashTipsSchema.parse(raw);
  const supabase = createAdminClient();

  const cashTips = Math.round(input.cashTips * 100) / 100;

  const { data: existing } = await supabase
    .from('z_report_days')
    .select('id')
    .eq('organization_id', org.id)
    .eq('report_date', input.reportDate)
    .maybeSingle();

  if (existing) {
    // admin-scope-ok: fetched above with .eq('organization_id', org.id), so this
    // id is always in-org.
    //
    // Updated rather than upserted so total_sales and cc_tips — which belong to
    // the POS — are never overwritten with defaults by a tips entry.
    const { error } = await supabase
      .from('z_report_days')
      .update({
        cash_tips: cashTips,
        // Marks the figure as counted by a person. The POS sync reads this and
        // leaves the row's cash tips alone — without it, the agent's next
        // five-minute window would overwrite this with 2Touch's zero.
        cash_tips_source: 'manual',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) throw new Error(`Could not save those cash tips: ${error.message}`);
  } else {
    const { error } = await supabase.from('z_report_days').insert({
      organization_id: org.id,
      report_date: input.reportDate,
      cash_tips: cashTips,
      cash_tips_source: 'manual',
      // Left at zero deliberately. The night's sales are the POS's to report,
      // and inventing them here would put a number in the books that nobody
      // measured.
      cc_tips: 0,
      total_sales: 0,
    });

    if (error) throw new Error(`Could not save those cash tips: ${error.message}`);
  }

  // Tips feed the split, payroll and the books.
  revalidatePath('/app/payroll');
  revalidatePath('/app/tips');
  revalidatePath('/app/books');
  revalidatePath('/app/dashboard');

  return getNightCash(input.reportDate);
}

const countedCashSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  // null clears a count entered by mistake.
  countedCash: z.number().min(0, 'Cannot be negative').max(1000000).nullable(),
});

/**
 * Sets the cash counted in the drawer for a night. Touches only counted_cash:
 * cash_tips and its 'manual' source belong to the tips entry above, and the POS
 * columns belong to the POS. Needs the night's Z row to exist, since a gap
 * against no sales figure would mean nothing.
 */
export async function logCountedCash(raw: unknown): Promise<NightCash> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not authorized');

  const input = countedCashSchema.parse(raw);
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('z_report_days')
    .select('id')
    .eq('organization_id', org.id)
    .eq('report_date', input.reportDate)
    .maybeSingle();
  if (!existing) throw new Error('The POS has not sent this night yet, so there is nothing to count against');

  // admin-scope-ok: fetched above with .eq('organization_id', org.id), so this
  // id is always in-org.
  const { error } = await supabase
    .from('z_report_days')
    .update({
      counted_cash: input.countedCash === null ? null : Math.round(input.countedCash * 100) / 100,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);
  if (error) {
    throw new Error(/counted_cash/.test(error.message)
      ? 'Counting the drawer is not switched on for this bar yet'
      : `Could not save that count: ${error.message}`);
  }

  revalidatePath('/app/sales');
  return getNightCash(input.reportDate);
}
