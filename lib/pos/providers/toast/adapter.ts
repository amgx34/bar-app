/**
 * Toast adapter: fetch, map, return a NormalizedPayload. It writes nothing to
 * the database; lib/pos/ingest.ts applyNormalized is the only writer, so every
 * guard in AGENTS.md (manual tips, manual hours, exclusions, bundles, delta
 * depletion) applies to Toast exactly as it does to 2Touch.
 *
 * Orders are the required feed: every business date in the window is fetched in
 * full, and orders MODIFIED since the window opened are fetched too, because a
 * refund on an old order lands on a later night and only the order itself says
 * so. Any failure there returns no rows at all, so a half-fetched night never
 * overwrites a correct one. Labor, employees and menus are optional: a failure
 * leaves that feed undefined, which the applier reads as "cannot say".
 */

import { addDays, businessDateOf, isValidTimeZone, zonedMs } from '@/lib/pos/business-date';
import type { NormalizedPayload } from '@/lib/pos/normalized';
import type { PosConfig } from '@/lib/pos/pos-config';
import { NeedsReauthError, type AdapterContext, type PosAdapter } from '@/lib/pos/providers/types';
import { createToastClient, fromToastDate, ToastHttpError, toastHost, type ToastClient } from '@/lib/toast/client';
import type { ToastOrder, ToastTimeEntry } from '@/lib/toast/types';
import { getAccessToken } from './auth';
import { mapToast } from './map';
import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

export function openToastClient(admin: Admin, orgId: string, cfg: PosConfig): ToastClient {
  const guid = typeof cfg.restaurant_guid === 'string' ? cfg.restaurant_guid : '';
  if (!guid) throw new NeedsReauthError('Toast is not connected');
  return createToastClient({
    host: toastHost(),
    restaurantGuid: guid,
    getToken: (force) => getAccessToken({ admin, orgId, force: !!force, rejected: force?.rejected }),
  });
}

/** Toast's own closeout hour and zone, read once at connect and stored. Never assumed. */
export function toastZone(cfg: PosConfig): { tz: string; closeoutHour: number } {
  const tz = cfg.timezone;
  const h = cfg.toast_closeout_hour;
  if (!isValidTimeZone(tz) || typeof h !== 'number' || !Number.isFinite(h)) {
    throw new Error('Toast time zone is not set. Reconnect Toast so Rail can read it.');
  }
  return { tz, closeoutHour: Math.min(23, Math.max(0, Math.trunc(h))) };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const status = (e: unknown, code: number) => e instanceof ToastHttpError && e.status === code;

/** What a 403 or 429 on a feed means to a person, because the fixes differ. */
function explain(feed: string, scope: string, e: unknown): string {
  if (status(e, 403)) return `${feed}: Toast refused access (403). The API credentials need the ${scope} permission.`;
  if (status(e, 429)) return `${feed}: Toast is rate limiting requests (429). It will retry on the next sync.`;
  return `${feed}: ${msg(e)}`;
}

export const toastAdapter: PosAdapter = {
  provider: 'toast',

  today(cfg, now) {
    const { tz, closeoutHour } = toastZone(cfg);
    return businessDateOf(now.getTime(), tz, closeoutHour);
  },

  async fetchPayload(ctx: AdapterContext): Promise<NormalizedPayload> {
    const { admin, orgId, posConfig, from, to } = ctx;
    const { tz, closeoutHour } = toastZone(posConfig);
    const client = openToastClient(admin, orgId, posConfig);
    const errors: string[] = [];
    const fail = (e: unknown, text: string) => {
      // No point trying the next feed with a login that does not work.
      if (e instanceof NeedsReauthError) throw e;
      if (status(e, 401)) throw new NeedsReauthError('Toast no longer accepts the saved login. Reconnect Toast.');
      console.error(`[toast] org=${orgId} ${text}`);
      errors.push(`toast ${text}`);
    };
    const empty = (): NormalizedPayload => ({ source: 'toast-api', pulledAt: new Date().toISOString(), zReports: [], ewReports: [], itemAudit: [], errors });

    const dates: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);

    const byGuid = new Map<string, ToastOrder>();
    try {
      for (const d of dates) for (const o of await client.ordersForDate(d)) byGuid.set(o.guid, o);
      // Older orders touched since the window opened: a refund or edit lands on a later night.
      for (const o of await client.ordersModified(new Date(zonedMs(from, closeoutHour, tz)), new Date(Date.now() + 60_000))) {
        const bd = fromToastDate(o.businessDate);
        if (bd && bd < from) byGuid.set(o.guid, o);
      }
    } catch (e) {
      fail(e, explain('orders', 'Orders read', e));
      return empty();
    }

    let employees = null as Awaited<ReturnType<ToastClient['employees']>> | null;
    try { employees = await client.employees(); }
    catch (e) { if (status(e, 403)) console.warn(`[toast] org=${orgId} employees not permitted`); else fail(e, explain('employees', 'Labor read', e)); }

    let timeEntries: Record<string, ToastTimeEntry[]> | null = null;
    try {
      const all: Record<string, ToastTimeEntry[]> = {};
      for (const d of dates) all[d] = await client.timeEntries(d);
      timeEntries = all;
    } catch (e) { if (status(e, 403)) console.warn(`[toast] org=${orgId} labor not permitted`); else fail(e, explain('labor', 'Labor read', e)); }

    let menu = null as Awaited<ReturnType<ToastClient['menus']>> | null;
    if (ctx.includeItems) {
      try { menu = await client.menus(); } catch (e) { fail(e, explain('menus', 'Menus read', e)); }
    }

    const mapped = mapToast({
      tz, from, to, orders: [...byGuid.values()], employees, timeEntries, menu,
      includeItems: ctx.includeItems,
      amountsInCents: process.env.TOAST_AMOUNTS_IN_CENTS === 'true',
    });
    return {
      source: 'toast-api',
      pulledAt: new Date().toISOString(),
      zReports: mapped.zReports,
      ewReports: mapped.ewReports ?? [],
      itemAudit: mapped.itemAudit ?? [],
      hourlySales: mapped.hourlySales,
      serverSales: mapped.serverSales,
      errors: [...errors, ...mapped.errors],
    };
  },
};
