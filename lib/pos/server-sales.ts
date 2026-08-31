/**
 * Per-bartender trade, as sent by the POS agent.
 *
 * Pure — no database, no clock.
 *
 * The server name is the natural key, and it is typed by whoever set the POS up.
 * Merging on a normalised form is therefore load-bearing: '  Kayla  Chen ' and
 * 'Kayla Chen' are one person, and treating them as two would show a bartender
 * selling half of what they sold.
 *
 * No attempt is made here to match the name to an employee. That is done at
 * read time and left nullable, so a bartender absent from the payroll list
 * still appears — they sold the drinks either way.
 */

import { isIsoDate } from '@/lib/date-range';

export type ServerSalesRow = {
  business_date: string;
  server_name: string;
  net_sales: number;
  ticket_count: number;
  tips: number;
};

export type RawServerRow = {
  business_date?: unknown;
  server_name?: unknown;
  net_sales?: unknown;
  ticket_count?: unknown;
  tips?: unknown;
};

function money(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function count(value: unknown): number | null {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** Collapses runs of whitespace so one person cannot become two rows. */
function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function normaliseServerRows(raw: RawServerRow[]): ServerSalesRow[] {
  const merged = new Map<string, ServerSalesRow>();

  for (const row of raw ?? []) {
    const date = row?.business_date;
    if (!isIsoDate(date)) continue;

    const name = cleanName(row?.server_name);
    if (!name) continue;

    const tickets = count(row?.ticket_count);
    if (tickets === null) continue;

    // Case-insensitive so 'KAYLA CHEN' and 'Kayla Chen' merge, but the FIRST
    // spelling is kept for display — upper-casing every name because one till
    // shouts would be a worse report than the inconsistency it fixes.
    const key = `${date}:${name.toLowerCase()}`;
    const existing = merged.get(key);

    if (existing) {
      existing.net_sales    = money(existing.net_sales + money(row?.net_sales));
      existing.ticket_count = existing.ticket_count + tickets;
      existing.tips         = money(existing.tips + money(row?.tips));
      continue;
    }

    merged.set(key, {
      business_date: date,
      server_name: name,
      net_sales: money(row?.net_sales),
      ticket_count: tickets,
      tips: money(row?.tips),
    });
  }

  return [...merged.values()];
}

/** Rows bucketed by night, for the same per-night replace as the hourly write. */
export function groupServerRowsByNight(
  rows: ServerSalesRow[],
): Map<string, ServerSalesRow[]> {
  const byNight = new Map<string, ServerSalesRow[]>();
  for (const row of rows) {
    const list = byNight.get(row.business_date);
    if (list) list.push(row);
    else byNight.set(row.business_date, [row]);
  }
  return byNight;
}
