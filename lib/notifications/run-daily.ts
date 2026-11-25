import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch, getOrgRecipients, getLastNotificationPayload } from './deliver';
import {
  detectLowStock, detectZReportClosed, detectSalesAnomaly,
  detectSalesTax, detectHourlyTips, detectFeedStale,
  detectWeeklySummary, weekEndingOn,
  type StockItem, type ZDay,
} from './detect';
import { deliverWeekly, type WeeklyDeps } from './weekly';
import { sendEmail } from '@/lib/reps/email';
import { SITE_URL } from '@/lib/site';
import { assessSyncHealth, type PosConfigShape } from '@/lib/pos/sync-health';
import { salesTaxFromSettings } from '@/lib/books/sales-tax';

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

/** A Z day plus the tip columns, which only the hourly-tips alert reads. */
type TipsZDay = ZDay & { cash_tips: number | null; cc_tips: number | null };

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

/**
 * Weekly summaries stay OFF until the owner sets WEEKLY_SUMMARY_ENABLED=true:
 * they send real email through the shared Gmail login.
 */
const weeklyEnabled = () => process.env.WEEKLY_SUMMARY_ENABLED === 'true';

export async function runDailyNotifications(): Promise<DailyRunResult> {
  const supabase = createAdminClient();
  const result: DailyRunResult = { orgsScanned: 0, notified: 0, errors: [] };

  // admin-scope-ok: this is the cron's org fan-out — it routes across every
  // organization by design. Each query inside the loop is scoped to one org.
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, bar_settings, pos_provider, pos_config');
  if (error) {
    result.errors.push(`org list failed: ${error.message}`);
    return result;
  }

  const businessDate = yesterdayISO();
  // Yesterday a Sunday means today is Monday: the week just closed.
  const week = weeklyEnabled() ? weekEndingOn(businessDate) : null;
  const emailBudget = { left: 50 };

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

      // ── POS feed went quiet ───────────────────────────────────────────────
      // Reads the org row already fetched above, so no extra query to scope.
      const feed = detectFeedStale(
        assessSyncHealth((org.pos_config ?? null) as PosConfigShape | null, org.pos_provider as string | null),
        org.pos_provider as string | null,
      );
      if (feed) result.notified += await dispatch(orgId, feed, opts);

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

      // ── Weekly owner summary (Mondays, only when switched on) ───────────────
      if (week) {
        const [{ data: wDays }, { data: wShifts }, { count: pending }] = await Promise.all([
          supabase.from('z_report_days')
            .select('report_date, total_sales, cash_tips, cc_tips')
            .eq('organization_id', orgId)
            .gte('report_date', week.priorStart).lte('report_date', week.end),
          supabase.from('employee_shifts')
            .select('regular_hours, overtime_hours')
            .eq('organization_id', orgId)
            .gte('shift_date', week.start).lte('shift_date', week.end),
          supabase.from('payroll_runs')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('status', 'pending_approval'),
        ]);
        const hours = (wShifts ?? []).reduce((t, r) => {
          const n = (x: unknown) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0);
          return t + n(r.regular_hours) + n(r.overtime_hours);
        }, 0);
        const built = detectWeeklySummary({
          week, days: wDays ?? [], hoursThisWeek: hours,
          items: (items ?? []) as StockItem[],
          pendingPayrollRuns: pending ?? 0,
          feedNote: feed?.title ?? null,
        });
        if (built) {
          const weeklyDeps: WeeklyDeps = {
            dispatch: (draft) => dispatch(orgId, draft, opts),
            alreadySent: async (key) => {
              const { count } = await supabase.from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', orgId).eq('dedupe_key', key);
              return (count ?? 0) > 0;
            },
            emailFor: async (userId) => {
              // admin-scope-ok: userId comes from this org's memberships (recipients above).
              const { data } = await supabase.auth.admin.getUserById(userId);
              return data.user?.email ?? null;
            },
            sendEmail: (to, subject, html) => sendEmail(to, subject, html),
            siteUrl: SITE_URL,
            emailBudget,
          };
          const w = await deliverWeekly(built, recipients, preferences, weeklyDeps);
          result.notified += w.notified;
          result.errors.push(...w.errors.map((e) => `${org.name ?? orgId}: ${e}`));
        }
      }

      // ── Nightly sales + anomaly ────────────────────────────────────────────
      const window = sameWeekdayWindow(businessDate);
      const { data: days } = await supabase
        .from('z_report_days')
        .select('report_date, total_sales, cash_sales, card_sales, cash_tips, cc_tips')
        .eq('organization_id', orgId)
        .in('report_date', [businessDate, ...window]);

      const rows      = (days ?? []) as TipsZDay[];
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

        // ── Sales tax held ───────────────────────────────────────────────────
        // Silent unless this bar has actually configured a rate and said how
        // its POS prices treat tax; the detector refuses to guess at either.
        const tax = detectSalesTax(
          yesterday,
          salesTaxFromSettings((org.bar_settings ?? {}) as {
            sales_tax_rate?: number | null;
            pos_prices_include_tax?: boolean | null;
          }),
        );
        if (tax) result.notified += await dispatch(orgId, tax, opts);
      }

      // ── Tips per hour ────────────────────────────────────────────────────
      // Its own query rather than a join: the hours live on employee_shifts,
      // keyed by shift_date, and the two tables are related by the night they
      // describe and nothing else. Runs whether or not a Z report landed —
      // z_report_days carries the tips, so an absent row simply means no tips
      // to divide and the detector returns null.
      if (yesterday) {
        const { data: shifts } = await supabase
          .from('employee_shifts')
          .select('regular_hours, overtime_hours')
          .eq('organization_id', orgId)
          .eq('shift_date', businessDate);

        const hoursWorked = (shifts ?? []).reduce((sum, s) => {
          // Junk and negatives are not hours — same reading as lib/payroll.
          const num = (raw: unknown) => {
            const n = Number(raw);
            return Number.isFinite(n) && n > 0 ? n : 0;
          };
          return sum + num(s.regular_hours) + num(s.overtime_hours);
        }, 0);

        const tips = detectHourlyTips({
          report_date: businessDate,
          cash_tips:   yesterday.cash_tips,
          cc_tips:     yesterday.cc_tips,
          hoursWorked,
        });
        if (tips) result.notified += await dispatch(orgId, tips, opts);
      }
    } catch (e) {
      result.errors.push(`${org.name ?? orgId}: ${String(e)}`);
    }
  }

  return result;
}
