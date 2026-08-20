'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Banknote, Check, CreditCard } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormStatus } from '@/components/ui/form-status';
import { getNightCash, logCashTips, type NightCash } from '../cash-actions';

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * End-of-night cash tip entry, sitting on the screen that splits them.
 *
 * The POS reports what went through a card reader and knows nothing about the
 * jar, so until this is entered the night's split is short by exactly the cash.
 * Putting it here rather than in a settings screen matters: it is done once a
 * night, at close, looking at the same date the split is being calculated for.
 */
export function CashTipsCard({
  date,
  canEdit,
  onSaved,
  embedded = false,
}: {
  date: string;
  canEdit: boolean;
  onSaved?: () => void;
  /** Drops the outer border when the panel is already inside a dialog. */
  embedded?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  // Carries the date it was loaded for, so "loading" is derived rather than set
  // synchronously in the effect.
  const [night, setNight] = useState<{ date: string; data: NightCash } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNightCash(date)
      .then((data) => {
        if (cancelled) return;
        setNight({ date, data });
        // Seeded with what is recorded, so the field shows the figure being
        // replaced rather than an empty box next to a non-zero total.
        setAmount(data.cashTips > 0 ? String(data.cashTips) : '');
        setJustSaved(false);
      })
      .catch(() => { if (!cancelled) setNight(null); });
    return () => { cancelled = true; };
  }, [date]);

  const loading = night?.date !== date;
  const current = loading ? null : night?.data ?? null;

  function save() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      setError('Enter the cash tips counted, or 0 if there were none');
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const updated = await logCashTips({ reportDate: date, cashTips: value });
        setNight({ date, data: updated });
        setJustSaved(true);
        toast.success(`${money(updated.cashTips)} cash tips logged for ${date}`);
        onSaved?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not save those cash tips';
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <div className={embedded ? 'space-y-3' : 'rounded-xl border border-border p-4 space-y-3'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          {!embedded && (
            <p className="flex items-center gap-2 font-heading text-sm font-semibold">
              <Banknote className="h-4 w-4 text-primary" aria-hidden />
              Cash tips for this night
            </p>
          )}
          <p className={embedded ? 'text-xs text-muted-foreground' : 'mt-0.5 text-xs text-muted-foreground'}>
            Counted from the jar. The POS only sees card tips, so the split is
            short until this is entered.
          </p>
        </div>
        {justSaved && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <Check className="h-3 w-3" aria-hidden />
            Saved
          </span>
        )}
      </div>

      {/* What the POS took, split by how it was paid.
          Cash sales less the tips paid out of the drawer is what should be in
          the till — which is the number someone counting cash actually wants,
          and the reason the split is worth carrying at all. */}
      {current && current.cashSales !== null && (
        <dl className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <Banknote className="h-3 w-3" aria-hidden />
              Cash sales
            </dt>
            <dd className="mt-0.5 font-medium tabular-nums">{money(current.cashSales)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <CreditCard className="h-3 w-3" aria-hidden />
              Card sales
            </dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {current.cardSales === null ? '—' : money(current.cardSales)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Expected in drawer</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {money(current.cashSales - current.cashTips)}
            </dd>
            <dd className="text-[11px] text-muted-foreground">
              cash sales less cash tips
            </dd>
          </div>
        </dl>
      )}

      {canEdit ? (
        <>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="cash-tips">Amount ($)</Label>
              <Input
                id="cash-tips"
                type="number" min="0" step="0.01" inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setJustSaved(false); }}
                disabled={loading || isPending}
              />
            </div>
            <Button onClick={save} disabled={loading || isPending}>
              {isPending ? 'Saving…' : 'Log cash tips'}
            </Button>
          </div>

          {/* Says what is being replaced, because this sets rather than adds — a
              second entry correcting a miscount must not double the figure. */}
          {current && current.cashTips > 0 && (
            <p className="text-xs text-muted-foreground">
              Currently recorded: {money(current.cashTips)}
              {current.cashTipsCounted ? ' (counted by hand)' : ' (from the POS)'}.
              Saving replaces it.
            </p>
          )}

          {current && !current.hasZReport && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              No Z report for this night yet. Saving records the cash tips now; the
              POS figures fill in when it syncs.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm">
          {loading ? '—' : money(current?.cashTips ?? 0)}
          <span className="ml-2 text-xs text-muted-foreground">
            recorded — ask a manager to change it
          </span>
        </p>
      )}

      <FormStatus status={error ? 'error' : 'idle'} message={error} />
    </div>
  );
}

/**
 * The same entry, reduced to one control on the date row.
 *
 * Cash tips are logged once a night, but the panel sat permanently above the
 * split taking a quarter of the screen from the numbers people actually come
 * here to read. As a button it still shows the figure — the one thing worth
 * seeing at a glance, and the thing that tells you whether the split below can
 * be trusted yet — and opens the full panel only when there is something to do.
 */
export function CashTipsButton({
  date,
  canEdit,
  onSaved,
}: {
  date: string;
  canEdit: boolean;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [night, setNight] = useState<{ date: string; data: NightCash } | null>(null);
  // Bumped on save so the button's own label refreshes without reopening.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getNightCash(date)
      .then((data) => { if (!cancelled) setNight({ date, data }); })
      .catch(() => { if (!cancelled) setNight(null); });
    return () => { cancelled = true; };
  }, [date, reload]);

  const current = night?.date === date ? night.data : null;
  const logged = (current?.cashTips ?? 0) > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Unlogged is styled as a prompt rather than a neutral control: a night
        // with no cash entered produces a split that is quietly wrong, so it
        // should not look finished.
        className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${
          logged
            ? 'border-border hover:bg-muted'
            : 'border-amber-500/50 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200'
        }`}
      >
        <Banknote className="h-4 w-4 shrink-0" aria-hidden />
        {current === null
          ? 'Cash tips'
          : logged
            ? <>Cash tips <span className="tabular-nums font-semibold">{money(current.cashTips)}</span></>
            : (canEdit ? 'Log cash tips' : 'No cash tips logged')}
        {logged && current?.cashTipsCounted && (
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" aria-hidden />
              Cash tips for this night
            </DialogTitle>
          </DialogHeader>
          <CashTipsCard
            embedded
            date={date}
            canEdit={canEdit}
            onSaved={() => { setReload((n) => n + 1); onSaved?.(); }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
