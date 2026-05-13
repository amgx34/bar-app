'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';

export interface WellDaySales {
  totalSales: number;
  totalTips: number;
  servers: { name: string; totalSales: number }[];
}

/** All dates that have Z report data, newest first. */
export async function getAvailableWellDates(): Promise<string[]> {
  const supabase = await createClient();
  const { org } = await getCurrentOrg();
  if (!org?.id) return [];

  // Prefer dates that have per-server data (richer); fall back to z_report_days
  const { data: serverDates } = await supabase
    .from('z_report_server_tips')
    .select('report_date')
    .eq('organization_id', org.id)
    .order('report_date', { ascending: false });

  if (serverDates && serverDates.length > 0) {
    return [...new Set(serverDates.map((r) => r.report_date as string))];
  }

  const { data: dayDates } = await supabase
    .from('z_report_days')
    .select('report_date')
    .eq('organization_id', org.id)
    .order('report_date', { ascending: false });

  return (dayDates ?? []).map((r) => r.report_date as string);
}

/** Sales breakdown for a single date. */
export async function getWellDaySales(date: string): Promise<WellDaySales | null> {
  const supabase = await createClient();
  const { org } = await getCurrentOrg();
  if (!org?.id) return null;

  const { data: day } = await supabase
    .from('z_report_days')
    .select('total_sales, cash_tips, cc_tips')
    .eq('organization_id', org.id)
    .eq('report_date', date)
    .single();

  const { data: servers } = await supabase
    .from('z_report_server_tips')
    .select('employee_name, total_sales')
    .eq('organization_id', org.id)
    .eq('report_date', date)
    .order('total_sales', { ascending: false });

  if (!day && (!servers || servers.length === 0)) return null;

  return {
    totalSales: (day?.total_sales as number) ?? 0,
    totalTips: ((day?.cash_tips as number) ?? 0) + ((day?.cc_tips as number) ?? 0),
    servers: (servers ?? []).map((s) => ({
      name: s.employee_name as string,
      totalSales: s.total_sales as number,
    })),
  };
}
