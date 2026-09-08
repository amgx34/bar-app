import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getMyPeriods } from './actions';
import { PeriodCard } from './_components/period-card';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My hours and pay' };

/**
 * What an employee sees.
 *
 * One page, stacked, mobile-first — this is read on a phone in a stockroom, not
 * at a desk. The order is the hierarchy: the unfinished period first, because
 * it is the only thing anybody can still act on, then the periods that have
 * been signed off.
 *
 * Nothing here is about anybody else. The only figure on this page that is not
 * this person's own is the bar's tip pool on nights they worked, which is
 * context for their own share.
 */
export default async function MyPayPage() {
  const { approved, inProgressHours } = await getMyPeriods();

  const inProgressTotal = inProgressHours.reduce((s, h) => s + h.hours, 0);
  const nothingYet = approved.length === 0 && inProgressHours.length === 0;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      {nothingYet && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing recorded yet. Once you have worked a shift it will show up
            here.
          </CardContent>
        </Card>
      )}

      {inProgressHours.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">This period</CardTitle>
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-3xl font-bold tabular-nums">
                {inProgressTotal.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">hrs so far</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              {inProgressHours.map((h) => (
                <div
                  key={h.date}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="text-muted-foreground">
                    {h.isOpener ? `${h.date} · opened` : h.date}
                  </span>
                  <span className="tabular-nums">
                    {h.hours.toLocaleString()} hrs
                  </span>
                </div>
              ))}
            </div>
            {/*
              Said out loud rather than shown as a zero. These hours have no
              approved pay figure, and inventing one would be a number nobody
              signed off. Showing the nights is the point: this is where a
              missing shift can still be caught.
            */}
            <p className="border-t pt-3 text-xs text-muted-foreground">
              These hours have not been approved yet, so there is no pay figure
              to show. If a night is missing or wrong, tell your manager now.
            </p>
          </CardContent>
        </Card>
      )}

      {approved.map((period) => (
        <PeriodCard key={`${period.periodStart}-${period.periodEnd}`} period={period} />
      ))}
    </main>
  );
}
