/**
 * Clover adapter: fetch, map, return a NormalizedPayload. It writes nothing to
 * the database; lib/pos/ingest.ts applyNormalized is the only writer, so every
 * guard in AGENTS.md (manual tips, manual hours, exclusions, bundles, delta
 * depletion) applies to Clover exactly as it does to 2Touch.
 *
 * Each feed has its own try. A failed required feed adds an error and leaves
 * its rows empty; a failed optional feed is left undefined, which the applier
 * reads as "cannot say" rather than "nothing happened".
 */

import { addDays, businessDateOf, isValidTimeZone, zonedMs } from '@/lib/pos/business-date';
import type { NormalizedPayload } from '@/lib/pos/normalized';
import type { PosConfig } from '@/lib/pos/pos-config';
import { NeedsReauthError, type AdapterContext, type PosAdapter } from '@/lib/pos/providers/types';
import { effectiveRegion, getAccessToken, cloverHosts } from './auth';
import { CloverHttpError, createCloverClient, type CloverClient } from './client';
import {
  mapClover,
  type CloverEmployee, type CloverOrder, type CloverPayment, type CloverRefund, type CloverShift,
} from './map';
import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

export function openCloverClient(admin: Admin, orgId: string, cfg: PosConfig): CloverClient {
  const region = effectiveRegion(cfg.clover_region);
  const merchantId = typeof cfg.merchant_id === 'string' ? cfg.merchant_id : '';
  if (!merchantId) throw new NeedsReauthError('Clover is not connected');
  return createCloverClient({
    apiHost: cloverHosts(region).api,
    merchantId,
    getToken: (force) => getAccessToken({ admin, orgId, region, force: !!force, rejected: force?.rejected }),
  });
}

export function cloverZone(cfg: PosConfig): { tz: string; cutoffHour: number } {
  const tz = cfg.timezone;
  if (!isValidTimeZone(tz)) throw new Error('Clover time zone is not set. Reconnect Clover so Rail can read it.');
  const c = Number(cfg.cutoff_hour);
  // Same clamp the agent applies: 0 to 12, default 4.
  return { tz, cutoffHour: Number.isFinite(c) ? Math.min(12, Math.max(0, Math.trunc(c))) : 4 };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const forbidden = (e: unknown) => e instanceof CloverHttpError && e.status === 403;

export const cloverAdapter: PosAdapter = {
  provider: 'clover',

  today(cfg, now) {
    const { tz, cutoffHour } = cloverZone(cfg);
    return businessDateOf(now.getTime(), tz, cutoffHour);
  },

  async fetchPayload(ctx: AdapterContext): Promise<NormalizedPayload> {
    const { admin, orgId, posConfig, from, to } = ctx;
    const { tz, cutoffHour } = cloverZone(posConfig);
    const client = openCloverClient(admin, orgId, posConfig);
    const start = zonedMs(from, cutoffHour, tz);
    const end = zonedMs(addDays(to, 1), cutoffHour, tz);
    const errors: string[] = [];
    const fail = (feed: string, e: unknown) => {
      if (e instanceof NeedsReauthError) throw e; // no point trying the next feed
      console.error(`[clover] org=${orgId} ${feed} feed failed:`, msg(e));
      errors.push(`clover ${feed}: ${msg(e)}`);
    };
    const inWindow = (field: string) => [`${field}>=${start}`, `${field}<${end}`];

    let payments: CloverPayment[] = [];
    let paymentsOk = false;
    try {
      payments = await client.list<CloverPayment>('/payments', { expand: 'tender', filter: inWindow('createdTime') });
      paymentsOk = true;
    } catch (e) { fail('payments', e); }

    let refunds: CloverRefund[] = [];
    try {
      refunds = await client.list<CloverRefund>('/refunds', { filter: inWindow('createdTime') });
    } catch (e) {
      // Without refunds a night is overstated, and the Z upsert would overwrite a
      // correct figure with it. Treat the pair as one required feed.
      paymentsOk = false;
      fail('refunds', e);
    }

    // A refund can point at a payment from an earlier night. Its tender decides
    // which side of the cash/card split it reduces, so fetch the ones we lack.
    const have = new Set(payments.map((p) => p.id));
    const extraPayments: CloverPayment[] = [];
    for (const id of new Set(refunds.map((r) => r.payment?.id).filter((x): x is string => !!x && !have.has(x)))) {
      if (extraPayments.length >= 50) break;
      try { extraPayments.push(await client.get<CloverPayment>(`/payments/${id}`, { expand: 'tender' })); }
      catch (e) { if (e instanceof NeedsReauthError) throw e; /* the split is dropped for that night */ }
    }

    let orders: CloverOrder[] | null = null;
    const catalog = new Map<string, string>();
    if (ctx.includeItems && paymentsOk) {
      try {
        // Orders paid in the window may have been opened before it; a payment bumps modifiedTime.
        orders = await client.list<CloverOrder>('/orders', {
          expand: ['lineItems', 'lineItems.discounts'], filter: [`modifiedTime>=${start}`],
        });
      } catch (e) { fail('orders', e); }
      if (orders) {
        try {
          const items = await client.list<{ id: string; categories?: { elements?: { name?: string }[] } }>(
            '/items', { expand: 'categories' });
          for (const i of items) {
            const name = i.categories?.elements?.[0]?.name?.trim();
            if (name) catalog.set(i.id, name);
          }
        } catch (e) { fail('catalog', e); }
      }
    }

    // Employees and shifts depend on permissions the bar may not have granted.
    // A 403 there is "not permitted", not a fault, so it is left undefined and quiet.
    let employees: CloverEmployee[] | null = null;
    try { employees = await client.list<CloverEmployee>('/employees'); }
    catch (e) { if (forbidden(e)) console.warn(`[clover] org=${orgId} employees not permitted`); else fail('employees', e); }

    let shifts: CloverShift[] | null = null;
    try { shifts = await client.list<CloverShift>('/shifts', { filter: [`inTime>=${start}`, `inTime<${end}`] }); }
    catch (e) { if (forbidden(e)) console.warn(`[clover] org=${orgId} shifts not permitted`); else fail('shifts', e); }

    if (!paymentsOk) {
      return { source: 'clover-api', pulledAt: new Date().toISOString(), zReports: [], ewReports: [], itemAudit: [], errors };
    }

    const mapped = mapClover({ tz, cutoffHour, from, to, payments, extraPayments, refunds, orders, catalog, employees, shifts });
    return {
      source: 'clover-api',
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
