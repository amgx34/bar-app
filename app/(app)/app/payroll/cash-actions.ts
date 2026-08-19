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
};

/** What is currently recorded for one night. */
export async function getNightCash(reportDate: string): Promise<NightCash> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('z_report_days')
    .select('report_date, cash_tips, cc_tips, total_sales, cash_sales, card_sales, cash_tips_source')
    .eq('organization_id', org.id)
    .eq('report_date', reportDate)
    .maybeSingle();

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
