'use client';

import { useEffect, useState, useTransition } from 'react';
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
export function TieOutCard({ date }: { date: string }) {
  const [night, setNight] = useState<{ date: string; data: NightCash } | null>(null);
  const [failed, setFailed] = useState(false);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
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
  }, [date]);

  const data = night?.date === date ? night.data : null;

  function save() {
    const value = Number(amount);
    if (amount.trim() === '' || !Number.isFinite(value) || value < 0) {
      setError('Enter the cash counted in the drawer, or 0 if it was empty');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const updated = await logCountedCash({ reportDate: date, countedCash: value });
        setNight({ date, data: updated });
        toast.success('Count saved');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save that count');
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
        {failed && <p className="text-sm text-muted-foreground">Could not load this night. Reload to try again.</p>}
        {!data && !failed && <p className="text-sm text-muted-foreground">Loading</p>}

        {data && result && (
          <>
            {/* Live region so the gap is announced when a count is saved. */}
            <div aria-live="polite" role="status">
              {result.state === 'cannot-tie-out' && result.reason === 'no-cash-split' && (
                <p className="text-sm">
                  Cannot tie out. Your POS did not send the cash and card split
                  {data.hasZReport ? ' for this night.' : ', and it has not sent this night at all yet.'}
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
            ) : result.reason !== 'no-cash-split' && data.hasZReport ? (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="counted-cash">Cash counted in the drawer ($)</Label>
                  <Input
                    id="counted-cash" type="number" min="0" step="0.01" inputMode="decimal"
                    placeholder="0.00" value={amount} disabled={isPending}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <Button onClick={save} disabled={isPending}>{isPending ? 'Saving…' : 'Save count'}</Button>
              </div>
            ) : null}
            <FormStatus status={error ? 'error' : 'idle'} message={error} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
