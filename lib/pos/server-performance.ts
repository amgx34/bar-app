/**
 * Trade by whoever rang it up.
 *
 * Pure — no database, no clock.
 *
 * SALES PER HOUR WORKED
 *
 * The figure that is genuinely hard to get anywhere else, and it falls out of
 * data Rail already holds for two different reasons: the POS knows who rang up
 * what, and payroll knows who was on. Neither half was collected for this.
 *
 * It is deliberately NOT presented as a league table. A bartender on the
 * service well and one on the front bar are not comparable, and a number that
 * invites that comparison without saying so does real damage to a room. The
 * shape here reports the figure; how it is framed is the screen's job.
 *
 * A server payroll has never heard of is KEPT, with nulls. They sold the
 * drinks, and dropping them would make the column stop adding up to the night.
 */

export type ServerRow = {
  business_date: string;
  server_name: string;
  net_sales: number;
  ticket_count: number;
  tips: number;
};

/** One person's hours over the same period, from `employee_shifts`. */
export type ShiftHours = { employeeName: string; hours: number };

export type ServerPerformance = {
  serverName: string;
  netSales: number;
  ticketCount: number;
  /** Null when they rang up nothing. */
  averageTicket: number | null;
  tips: number;
  /** Null when payroll has no matching person, or no shift data was given. */
  hoursWorked: number | null;
  /** Null when hours are unknown or zero. */
  salesPerHour: number | null;
  /** Share of the period's takings. Null when the period took nothing. */
  sharePct: number | null;
  /** Whether the POS name matched a payroll name at all. */
  matchedEmployee: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The form two spellings of one person share.
 *
 * The POS name is typed by whoever set the till up and the payroll name by
 * whoever did the hiring; they agree on the person and disagree on the
 * spacing and the caps.
 */
function nameKey(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').toLowerCase()
    : '';
}

export function buildServerPerformance(
  rows: ServerRow[],
  shifts?: ShiftHours[],
): ServerPerformance[] {
  // Undefined means "payroll was not consulted", which is a different fact
  // from "payroll knows nobody" and must not silently become 0 hours.
  const haveShifts = Array.isArray(shifts);

  const hoursByName = new Map<string, number>();
  if (haveShifts) {
    for (const sh of shifts ?? []) {
      const key = nameKey(sh?.employeeName);
      if (!key) continue;
      // Summed: one person can work several shifts inside the period.
      hoursByName.set(key, (hoursByName.get(key) ?? 0) + num(sh?.hours));
    }
  }

  const byServer = new Map<string, { name: string; net: number; tickets: number; tips: number }>();

  for (const r of rows ?? []) {
    const key = nameKey(r?.server_name);
    if (!key) continue;

    const existing = byServer.get(key);
    if (existing) {
      existing.net += num(r?.net_sales);
      existing.tickets += num(r?.ticket_count);
      existing.tips += num(r?.tips);
      continue;
    }
    // First spelling seen is the one displayed — upper-casing every name
    // because one till shouts would be a worse report than the inconsistency.
    byServer.set(key, {
      name: String(r.server_name).trim().replace(/\s+/g, ' '),
      net: num(r?.net_sales),
      tickets: num(r?.ticket_count),
      tips: num(r?.tips),
    });
  }

  const totalNet = [...byServer.values()].reduce((s, v) => s + v.net, 0);

  const out: ServerPerformance[] = [];
  for (const [key, v] of byServer) {
    const matched = haveShifts && hoursByName.has(key);
    const hoursWorked = matched ? round2(hoursByName.get(key)!) : null;

    out.push({
      serverName: v.name,
      netSales: round2(v.net),
      ticketCount: v.tickets,
      averageTicket: v.tickets > 0 ? round2(v.net / v.tickets) : null,
      tips: round2(v.tips),
      hoursWorked,
      // Zero hours is not a performance figure — it is a division by zero.
      salesPerHour: hoursWorked !== null && hoursWorked > 0
        ? round2(v.net / hoursWorked)
        : null,
      sharePct: totalNet > 0 ? (v.net / totalNet) * 100 : null,
      matchedEmployee: matched,
    });
  }

  // By takings. The screen decides whether to present this as a ranking.
  return out.sort((a, b) => b.netSales - a.netSales);
}
