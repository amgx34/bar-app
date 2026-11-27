'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormStatus } from '@/components/ui/form-status';
import { tieOut } from '@/lib/pos/tie-out';
import { getNightCash, logCountedCash, type NightCash } from '../../payroll/cash-actions';

const money = (n: number) =>
  `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Did the drawer tie out? One night, owner and manager only (the page gates it).
 * Night level: nothing here names who ran the drawer.
 */
export function TieOutCard({ date, live = false }: { date: string; live?: boolean }) {
  const [night, setNight] = useState<{ date: string; data: NightCash } | null>(null);
  const [failed, setFailed] = useState(false);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (live) return; // nothing to load until close
    let cancelled = false;
    getNightCash(date)
      .then((data) => {
        if (cancelled) return;
        setFailed(false);
        setNight({ date, data });
        setAmount(data.countedCash === null ? '' : String(data.countedCash));
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [date, live, reload]);

  const data = night?.date === date ? night.data : null;

  function save() {
    const cleaned = amount.trim().replace(/,/g, '');
    const value = Number(cleaned);
    if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned) || !Number.isFinite(value) || value < 0) {
      setError('Enter the cash counted in the drawer, or 0 if it was empty');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const updated = await logCountedCash({ reportDate: date, countedCash: value });
        setNight({ date, data: updated });
        toast.success('Count saved');
      } catch {
        setError('Your count was not saved. Check your connection and try again.');
      }
    });
  }

  const result = data && tieOut(data);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Did the drawer tie out?</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cash sales less cash tips is what should be in the till at close.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {live && <p className="text-sm text-muted-foreground">Available after close. The night is still moving, so a count now would not mean anything.</p>}
        {!live && failed && (
          <p className="text-sm text-muted-foreground">
            Could not load this night.{' '}
            <Button variant="outline" size="sm" className="ml-1 h-11" onClick={() => { setFailed(false); setReload((n) => n + 1); }}>Try again</Button>
          </p>
        )}
        {!live && !data && !failed && <p className="text-sm text-muted-foreground">Loading</p>}

        {!live && data && result && (
          <>
            {/* Live region so the gap is announced when a count is saved. */}
            <div aria-live="polite" role="status">
              {result.state === 'cannot-tie-out' && result.reason === 'no-cash-split' && (
                <p className="text-sm">
                  Cannot tie out. Your POS did not send the cash and card split
                  {data.hasZReport ? ' for this night.' : ', and it has not sent this night at all yet.'}
                  {' '}Ask your POS provider to turn on the cash and card split, or check the{' '}
                  <Link href="/app/settings?tab=pos" className="underline underline-offset-2">POS Integration tab</Link>.
                </p>
              )}
              {result.state === 'cannot-tie-out' && result.reason === 'tips-not-entered' && (
                <p className="text-sm">
                  Enter cash tips for this night first (enter 0 if there were none). Until then the drawer figure would read short by
                  the tips already paid out.{' '}
                  <Link href={`/app/payroll?view=day&date=${date}`} className="underline underline-offset-2">Enter cash tips</Link>.
                </p>
              )}
              {result.state === 'cannot-tie-out' && result.reason === 'no-count' && (
                <p className="text-sm text-muted-foreground">
                  Expected in the drawer: <span className="font-medium tabular-nums text-foreground">{money(result.expected ?? 0)}</span>.
                  Count the drawer and enter it below.
                </p>
              )}
              {result.state === 'balanced' && (
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  Balanced. Counted {money(data.countedCash ?? 0)}, expected {money(result.expected ?? 0)}.
                </p>
              )}
              {(result.state === 'over' || result.state === 'short') && (
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {result.state === 'over' ? 'Over' : 'Short'} by {money(result.gap ?? 0)}.
                  {' '}Counted {money(data.countedCash ?? 0)}, expected {money(result.expected ?? 0)}.
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Tips owed for the night: <span className="tabular-nums">{money(result.tipsOwed)}</span> (card
              {' '}{money(data.ccTips)} plus cash {money(data.cashTips)}).
            </p>

            {!data.countedCashAvailable ? (
              <p className="text-xs text-muted-foreground">
                Counting the drawer is not switched on for this bar yet.
              </p>
            ) : result.reason !== 'no-cash-split' && result.reason !== 'tips-not-entered' && data.hasZReport ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[10rem] flex-1 space-y-1.5">
                  <Label htmlFor="counted-cash">Cash counted in the drawer ($)</Label>
                  <Input
                    id="counted-cash" type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                    className="h-11" aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'counted-cash-error' : undefined}
                    placeholder="0.00" value={amount} disabled={isPending}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <Button className="h-11 w-full sm:w-auto" onClick={save} disabled={isPending}>{isPending ? 'Saving…' : 'Save count'}</Button>
              </div>
            ) : null}
            <div id="counted-cash-error"><FormStatus status={error ? 'error' : 'idle'} message={error} /></div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
