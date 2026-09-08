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

  const caveat = anyHours && (
    <p className="border-t px-3 py-2 text-xs text-muted-foreground sm:px-4">
      Sales per hour uses recorded shift hours. It is not a ranking — a well
      and a front bar are not comparable, and the busier station is not the
      better bartender.
    </p>
  );

  return (
    <>
      {/*
        Below `sm` the table becomes stacked cards. Five columns in a horizontal
        scroller means the per-hour figure — the one with the caveat attached —
        sits off-screen by default, which is the worst possible place for a
        number that is easy to misread as a league position.
      */}
      <div className="space-y-2 sm:hidden">
        {servers.map((s) => (
          <div key={s.serverName} className="rounded-xl border p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{s.serverName}</span>
              <span className="shrink-0 tabular-nums font-semibold">{money(s.netSales)}</span>
            </div>
            {!s.matchedEmployee && (
              <p className="mt-0.5 text-xs text-muted-foreground">not on payroll</p>
            )}
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <div className="flex gap-1.5">
                <dt>Tickets</dt>
                <dd className="tabular-nums text-foreground">{s.ticketCount.toLocaleString()}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Avg</dt>
                <dd className="tabular-nums text-foreground">
                  {s.averageTicket === null ? '—' : money(s.averageTicket)}
                </dd>
              </div>
              {anyHours && (
                <div className="flex gap-1.5">
                  <dt>Per hour</dt>
                  <dd className="tabular-nums text-foreground">
                    {s.salesPerHour === null ? '—' : money(s.salesPerHour)}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ))}
        {caveat && <div className="rounded-xl border">{caveat}</div>}
      </div>

    <div className="hidden overflow-x-auto rounded-xl border sm:block">
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
      {caveat}
    </div>
    </>
  );
}
