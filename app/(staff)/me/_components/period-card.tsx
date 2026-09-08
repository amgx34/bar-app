import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ApprovedPeriod } from '../actions';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/**
 * One approved pay period.
 *
 * Everything here came out of payroll_runs.snapshot — figures an owner signed
 * off. Nothing on this card is recomputed, which is why a period frozen before
 * the breakdown existed shows totals and says so, rather than filling the gap
 * with today's arithmetic.
 */
export function PeriodCard({ period }: { period: ApprovedPeriod }) {
  const { stub } = period;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          {period.periodStart} – {period.periodEnd}
        </CardTitle>
        <div className="flex items-baseline gap-4 pt-1">
          <span className="text-3xl font-bold tabular-nums text-primary">
            {money(stub.totalPay)}
          </span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {stub.totalHours.toLocaleString()} hrs
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {stub.breakdown ? (
          <div className="space-y-1.5 border-t pt-3">
            <Row label="Base pay" value={money(stub.breakdown.regularPay)} />
            {stub.breakdown.overtimeHours > 0 && (
              <Row
                label={`Overtime (${stub.breakdown.overtimeHours.toLocaleString()} hrs)`}
                value={money(stub.breakdown.overtimePay)}
              />
            )}
            <Row label="Tips" value={money(stub.breakdown.tipAmount)} />
            <Row
              label="Worth per hour"
              value={`${money(stub.breakdown.effectiveHourlyRate)}/hr`}
            />
          </div>
        ) : (
          <p className="border-t pt-3 text-sm text-muted-foreground">
            The detailed breakdown was not recorded for this period.
          </p>
        )}

        {stub.shifts.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Nights worked
            </p>
            {stub.shifts.map((s) => (
              <Row
                key={s.date}
                label={s.isOpener ? `${s.date} · opened` : s.date}
                value={`${s.hours.toLocaleString()} hrs`}
              />
            ))}
          </div>
        )}

        {stub.tipContext.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              The bar&rsquo;s tip pool on those nights
            </p>
            {stub.tipContext.map((t) => (
              <Row key={t.date} label={t.date} value={money(t.poolTotal)} />
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              The whole bar&rsquo;s pool for the night. Your share of the period
              is the tips figure above.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
