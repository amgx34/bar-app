'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Repeat, Receipt } from 'lucide-react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FormStatus } from '@/components/ui/form-status';
import { EXPENSE_CATEGORY_LABEL, type ExpenseCategory } from '@/lib/books/cost-structure';
import { createExpense, deleteExpense, type ExpenseRow } from '../expense-actions';

const CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABEL) as [ExpenseCategory, string][];

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Costs that never touch inventory — a DJ, a repair, a licence.
 *
 * Lives on the Books page rather than in Settings because it is bookkeeping,
 * not configuration: it is entered while looking at the month it belongs to,
 * and the effect on net operating should be visible in the same view.
 *
 * The form is collapsed by default. Adding an expense is occasional, and a
 * permanently open form would push the list — the thing you usually came to
 * read — below the fold.
 */
export function ExpensesPanel({
  expenses,
  periodStart,
  canEdit,
}: {
  expenses: ExpenseRow[];
  periodStart: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('entertainment');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(periodStart);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringUntil, setRecurringUntil] = useState('');

  function reset() {
    setDescription('');
    setAmount('');
    setIsRecurring(false);
    setRecurringUntil('');
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await createExpense({
          description,
          category,
          amount: Number(amount),
          expenseDate,
          isRecurring,
          recurringUntil: isRecurring && recurringUntil ? recurringUntil : null,
        });
        toast.success(`${description} added`);
        reset();
        setOpen(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not save that expense';
        setError(message);
        toast.error(message);
      }
    });
  }

  function remove(e: ExpenseRow) {
    startTransition(async () => {
      try {
        await deleteExpense(e.id);
        toast.success(`${e.description} removed`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove that expense');
      }
    });
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" aria-hidden />
              Operating expenses
            </CardTitle>
            <CardDescription>
              Costs that never touch inventory — DJs, repairs, licences, utilities.
              These come off below gross profit, so they never distort pour cost.
            </CardDescription>
          </div>
          {canEdit && !open && (
            <Button size="sm" onClick={() => setOpen(true)} className="shrink-0 gap-1.5">
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {canEdit && open && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="exp-desc">What was it?</Label>
                <Input
                  id="exp-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Saturday DJ"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exp-cat">Category</Label>
                <Select value={category} onValueChange={(v) => setCategory((v ?? 'other') as ExpenseCategory)}>
                  <SelectTrigger id="exp-cat" className="w-full h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exp-amount">Amount ($)</Label>
                <Input
                  id="exp-amount"
                  type="number" min="0" step="0.01" inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exp-date">Date</Label>
                <Input
                  id="exp-date"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exp-recurring" className="flex items-center gap-2">
                  <input
                    id="exp-recurring"
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="h-4 w-4 accent-primary cursor-pointer"
                  />
                  <span className="inline-flex items-center gap-1.5">
                    <Repeat className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    Every month
                  </span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Enter once and it counts in every month it covers.
                </p>
              </div>

              {/* Revealed only when it applies — an end date on a one-off would
                  be a field with no meaning. */}
              {isRecurring && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="exp-until">Until (optional)</Label>
                  <Input
                    id="exp-until"
                    type="date"
                    min={expenseDate}
                    value={recurringUntil}
                    onChange={(e) => setRecurringUntil(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank if it is ongoing.
                  </p>
                </div>
              )}
            </div>

            <FormStatus status={error ? 'error' : 'idle'} message={error} />

            <div className="flex items-center gap-2">
              <Button onClick={submit} disabled={isPending}>
                {isPending ? 'Saving…' : 'Add expense'}
              </Button>
              <Button variant="ghost" onClick={() => { setOpen(false); reset(); }} disabled={isPending}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing recorded for this period. Anything you pay for that is not stock —
            entertainment, repairs, licences — belongs here.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border border-y border-border">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {e.description}
                      {e.is_recurring && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[0.6875rem] font-normal text-muted-foreground">
                          <Repeat className="h-3 w-3" aria-hidden />
                          monthly
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {e.categoryLabel} · {e.expense_date}
                      {e.is_recurring && e.recurring_until && ` – ${e.recurring_until}`}
                    </span>
                  </span>

                  <span className="shrink-0 tabular-nums text-sm font-medium">
                    {money(e.amount)}
                    {e.is_recurring && (
                      <span className="block text-right text-xs font-normal text-muted-foreground">
                        per month
                      </span>
                    )}
                  </span>

                  {canEdit && (
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => remove(e)}
                      disabled={isPending}
                      aria-label={`Remove ${e.description}`}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>

            {/* As entered, not as applied: a monthly cost counts once here and
                in every month of the report, so labelling this a period total
                would contradict the P&L. */}
            <p className="text-xs text-muted-foreground">
              {expenses.length} {expenses.length === 1 ? 'entry' : 'entries'} totalling{' '}
              <span className="font-medium text-foreground">{money(total)}</span> as entered.
              Monthly costs are counted once per month in the statement above.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
