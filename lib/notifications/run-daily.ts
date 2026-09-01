import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch, getOrgRecipients, getLastNotificationPayload } from './deliver';
import {
  detectLowStock, detectZReportClosed, detectSalesAnomaly,
  type StockItem, type ZDay,
} from './detect';

/**
 * The nightly notification pass, driven by the Vercel cron.
 *
 * All three periodic alerts want to fire once, after the night is reconciled —
 * which is exactly the cadence the one cron this plan allows already runs at.
 * The cron is a scheduler here, not a queue: moving to a tighter schedule is a
 * one-line change in vercel.json and needs nothing else touched.
 *
 * Every org is isolated. One bar with a malformed Z report must not cost every
 * other bar its notifications, which is the same reason the cron route wraps
 * each of its housekeeping blocks separately.
 */

export type DailyRunResult = {
  orgsScanned:   number;
  notified:      number;
  errors:        string[];
};

/** Yesterday in the venue's local reckoning — the night that just closed. */
function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** The same weekday for the preceding four weeks. */
function sameWeekdayWindow(iso: string, weeks = 4): string[] {
  const [y, m, d] = iso.split('-').map(Number);
  const out: string[] = [];
  for (let i = 1; i <= weeks; i++) {
    const dt = new Date(y, m - 1, d - i * 7);
    out.push([
      dt.getFullYear(),
      String(dt.getMonth() + 1).padStart(2, '0'),
      String(dt.getDate()).padStart(2, '0'),
    ].join('-'));
  }
  return out;
}

export async function runDailyNotifications(): Promise<DailyRunResult> {
  const supabase = createAdminClient();
  const result: DailyRunResult = { orgsScanned: 0, notified: 0, errors: [] };

  // admin-scope-ok: this is the cron's org fan-out — it routes across every
  // organization by design. Each query inside the loop is scoped to one org.
  const { data: orgs, error } = await supabase.from('organizations').select('id, name');
  if (error) {
    result.errors.push(`org list failed: ${error.message}`);
    return result;
  }

  const businessDate = yesterdayISO();

  for (const org of orgs ?? []) {
    const orgId = org.id as string;
    result.orgsScanned++;

    try {
      // Recipients and preferences are the same for all three alerts, so they
      // are fetched once per org rather than once per alert.
      const recipients = await getOrgRecipients(orgId);
      if (recipients.length === 0) continue;

      const { data: prefs } = await supabase
        .from('notification_preferences')
        .select('user_id, event_type, muted')
        .eq('organization_id', orgId);
      const preferences = prefs ?? [];
      const opts = { recipients, preferences };

      // ── Low stock ──────────────────────────────────────────────────────────
      const { data: items } = await supabase
        .from('inventory_items')
        .select('id, name, current_stock, par_level')
        .eq('organization_id', orgId)
        .eq('is_active', true);

      const previous = await getLastNotificationPayload(orgId, 'inventory.low_stock');
      const lowStock = detectLowStock(
        (items ?? []) as StockItem[],
        previous ? { itemIds: (previous.itemIds as string[]) ?? [] } : null,
        businessDate,
      );
      if (lowStock) result.notified += await dispatch(orgId, lowStock, opts);

      // ── Nightly sales + anomaly ────────────────────────────────────────────
      const window = sameWeekdayWindow(businessDate);
      const { data: days } = await supabase
        .from('z_report_days')
        .select('report_date, total_sales, cash_sales, card_sales')
        .eq('organization_id', orgId)
        .in('report_date', [businessDate, ...window]);

      const rows      = (days ?? []) as ZDay[];
      const yesterday = rows.find((d) => d.report_date === businessDate);

      // No Z report for last night is not an error — the bar may have been
      // closed, or the agent may report later in the day.
      if (yesterday) {
        const closed = detectZReportClosed(yesterday);
        if (closed) result.notified += await dispatch(orgId, closed, opts);

        const anomaly = detectSalesAnomaly(
          yesterday,
          rows.filter((d) => d.report_date !== businessDate),
        );
        if (anomaly) result.notified += await dispatch(orgId, anomaly, opts);
      }
    } catch (e) {
      result.errors.push(`${org.name ?? orgId}: ${String(e)}`);
    }
  }

  return result;
}
