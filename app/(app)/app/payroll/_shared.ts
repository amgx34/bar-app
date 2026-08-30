import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';

/**
 * Data and date helpers shared by the Payroll routes.
 *
 * Payroll used to be one page switching on `?tab=`, so all four views loaded the
 * same employee list and the same twelve-week trend whether they needed them or
 * not. Splitting them into real routes would have duplicated those queries four
 * times instead; this keeps them declared once and lets each route ask only for
 * what it actually renders.
 */

export function toLocalDateStr(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Monday of the week containing `iso`. Sunday counts as the END of a week. */
export function getMondayStr(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return toLocalDateStr(date);
}

/**
 * The current pay week, Monday to Sunday.
 *
 * A bar's week does not end on Saturday night — Sunday trade belongs to the week
 * that preceded it, which is why Sunday maps back six days rather than forward.
 */
export function defaultWeek(): { start: string; end: string } {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toLocalDateStr(monday), end: toLocalDateStr(sunday) };
}

export type PayrollEmployee = Record<string, unknown> & { id: string; name: string };

/** Every employee at the caller's bar. Needed by three of the four routes. */
export async function loadEmployees(): Promise<PayrollEmployee[]> {
  const { org } = await getCurrentOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from('employees')
    .select('*')
    .eq('organization_id', org.id)
    .order('name');
  return (data ?? []) as PayrollEmployee[];
}

const WMONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Twelve weeks of sales and tips, bucketed by the Monday that starts each week.
 *
 * Only the Pay Run screen charts this, so only that route loads it.
 */
export async function loadWeeklyTrend(): Promise<
  { weekLabel: string; sales: number; tips: number }[]
> {
  const { org } = await getCurrentOrg();
  const supabase = await createClient();

  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  const { data: trendDays } = await supabase
    .from('z_report_days')
    .select('report_date, total_sales, cash_tips, cc_tips')
    .eq('organization_id', org.id)
    .gte('report_date', toLocalDateStr(twelveWeeksAgo))
    .order('report_date');

  const weeklyMap = new Map<string, { sales: number; tips: number }>();
  for (const day of trendDays ?? []) {
    const monday = getMondayStr(day.report_date as string);
    if (!weeklyMap.has(monday)) weeklyMap.set(monday, { sales: 0, tips: 0 });
    const w = weeklyMap.get(monday)!;
    w.sales += day.total_sales ?? 0;
    w.tips += (day.cash_tips ?? 0) + (day.cc_tips ?? 0);
  }

  return [...weeklyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, { sales, tips }]) => {
      const [, m, d] = iso.split('-').map(Number);
      return { weekLabel: `${WMONTHS[m - 1]} ${d}`, sales, tips };
    });
}

/**
 * Where an old `?tab=` link should land now that the tabs are real routes.
 *
 * Bookmarks and anything already sent to staff keep working rather than silently
 * dropping onto the pay run.
 */
export const LEGACY_TAB_ROUTES: Record<string, string> = {
  employees: '/app/payroll/employees',
  // The day view of the pay period screen, not a route of its own any more.
  split: '/app/payroll?view=day',
  'direct-deposit': '/app/payroll/direct-deposit',
};
