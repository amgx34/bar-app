/**
 * Hourly trade, as sent by the POS agent.
 *
 * Pure — no database, no clock.
 *
 * These rows arrive over HTTP from an agent running on a bar's own POS box, so
 * nothing here trusts its input. A row that cannot be placed on a night and an
 * hour is dropped rather than defaulted: an hour of trade filed against the
 * wrong night is worse than an hour missing, because the missing one is visible
 * and the misfiled one is not.
 */

import { isIsoDate } from '@/lib/date-range';

export type HourlySalesRow = {
  /** The night the trade belongs to, already offset by the bar's cutoff. */
  business_date: string;
  /** Real clock hour, 0-23. */
  hour: number;
  net_sales: number;
  ticket_count: number;
  tips: number;
};

export type RawHourlyRow = {
  business_date?: unknown;
  hour?: unknown;
  net_sales?: unknown;
  ticket_count?: unknown;
  tips?: unknown;
};

function money(value: unknown): number {
  const n = Number(value ?? 0);
  // Absent is zero; unparseable is also zero rather than NaN, which would
  // spread through every sum downstream.
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function count(value: unknown): number | null {
  const n = Number(value ?? 0);
  // Negative tickets cannot happen and mean a broken feed. Net sales may go
  // negative on a refund hour, which is why only this one is guarded.
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * Validates and merges raw rows.
 *
 * Duplicate hours are SUMMED, not overwritten. The agent's source UNIONs the
 * history and daily tables, so one hour can legitimately arrive twice; letting
 * the last one win would silently halve that hour.
 */
export function normaliseHourlyRows(raw: RawHourlyRow[]): HourlySalesRow[] {
  const merged = new Map<string, HourlySalesRow>();

  for (const row of raw ?? []) {
    const date = row?.business_date;
    if (!isIsoDate(date)) continue;

    const hour = Number(row?.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;

    const tickets = count(row?.ticket_count);
    if (tickets === null) continue;

    const key = `${date}:${hour}`;
    const existing = merged.get(key);

    if (existing) {
      existing.net_sales    = money(existing.net_sales + money(row?.net_sales));
      existing.ticket_count = existing.ticket_count + tickets;
      existing.tips         = money(existing.tips + money(row?.tips));
      continue;
    }

    merged.set(key, {
      business_date: date,
      hour,
      net_sales: money(row?.net_sales),
      ticket_count: tickets,
      tips: money(row?.tips),
    });
  }

  return [...merged.values()];
}

/**
 * Rows bucketed by night.
 *
 * The write is a per-night REPLACE rather than an upsert, because an hour can
 * lose sales when a ticket is voided after the fact and a blind merge would
 * leave the old figure standing. That is only safe because the agent always
 * sends a whole night, never a delta — so the caller needs the nights.
 */
export function groupByNight(rows: HourlySalesRow[]): Map<string, HourlySalesRow[]> {
  const byNight = new Map<string, HourlySalesRow[]>();
  for (const row of rows) {
    const list = byNight.get(row.business_date);
    if (list) list.push(row);
    else byNight.set(row.business_date, [row]);
  }
  return byNight;
}
