import type { ServerPerformance } from '@/lib/pos/server-performance';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * Trade by whoever rang it up.
 *
 * Presented as a record of the period, not a leaderboard. A bartender on the
 * service well and one on the front bar are not comparable, and a table that
 * invites that comparison without saying so does real damage to a room. Hence
 * no ranking numbers, no medals, and the sales-per-hour column carrying an
 * explicit caveat rather than a trophy.
 *
 * Somebody the payroll list has never heard of still appears — they sold the
 * drinks. Their hours column simply reads as unknown.
 */
export function ServerTable({ servers }: { servers: ServerPerformance[] }) {
  const anyHours = servers.some((s) => s.hoursWorked !== null);

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-3 py-3 font-medium sm:px-4">Bartender</th>
            <th className="px-3 py-3 text-right font-medium sm:px-4">Sales</th>
            <th className="px-3 py-3 text-right font-medium sm:px-4">Tickets</th>
            <th className="hidden px-3 py-3 text-right font-medium sm:table-cell sm:px-4">Avg</th>
            {anyHours && (
              <th className="px-3 py-3 text-right font-medium sm:px-4">Per hour</th>
            )}
          </tr>
        </thead>
        <tbody>
          {servers.map((s) => (
            <tr key={s.serverName} className="border-b last:border-b-0">
              <td className="px-3 py-3 font-medium sm:px-4">
                {s.serverName}
                {!s.matchedEmployee && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    not on payroll
                  </span>
                )}
              </td>
              <td className="px-3 py-3 text-right tabular-nums sm:px-4">{money(s.netSales)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-muted-foreground sm:px-4">
                {s.ticketCount.toLocaleString()}
              </td>
              <td className="hidden px-3 py-3 text-right tabular-nums text-muted-foreground sm:table-cell sm:px-4">
                {s.averageTicket === null ? '—' : money(s.averageTicket)}
              </td>
              {anyHours && (
                <td className="px-3 py-3 text-right tabular-nums sm:px-4">
                  {s.salesPerHour === null ? '—' : money(s.salesPerHour)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {anyHours && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground sm:px-4">
          Sales per hour uses recorded shift hours. It is not a ranking — a well
          and a front bar are not comparable, and the busier station is not the
          better bartender.
        </p>
      )}
    </div>
  );
}
