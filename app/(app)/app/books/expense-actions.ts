'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser, getCurrentOrg } from '@/lib/org';
import { canEditInventory } from '@/lib/permissions';
import { EXPENSE_CATEGORY_LABEL, type ExpenseCategory } from '@/lib/books/cost-structure';

/**
 * Costs that never touch inventory: a DJ, a plumber, a music licence.
 *
 * These are ordinary money leaving the business that no stock movement will
 * ever describe, so before this they were simply missing from the P&L.
 */

const CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABEL) as [ExpenseCategory, ...ExpenseCategory[]];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const expenseSchema = z
  .object({
    description: z.string().trim().min(2, 'Give it a name').max(200),
    category: z.enum(CATEGORIES),
    // Bounded: this lands in a financial statement, and a mis-keyed amount is
    // harder to spot there than in a form.
    amount: z.number().positive('Enter an amount greater than zero').max(1_000_000),
    expenseDate: isoDate,
    isRecurring: z.boolean().default(false),
    recurringUntil: isoDate.nullable().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) => !v.recurringUntil || v.recurringUntil >= v.expenseDate,
    { message: 'The end date cannot be before the start date', path: ['recurringUntil'] },
  );

export type ExpenseRow = {
  id: string;
  description: string;
  category: ExpenseCategory;
  categoryLabel: string;
  amount: number;
  expense_date: string;
  is_recurring: boolean;
  recurring_until: string | null;
  notes: string | null;
};

export async function listExpenses(startDate: string, endDate: string): Promise<ExpenseRow[]> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  // Recurring rows are returned whenever they STARTED on or before the window,
  // because one entered in January still applies in August. The books expand
  // them across months; this list shows them once, as entered.
  const { data } = await supabase
    .from('operating_expenses')
    .select('id, description, category, amount, expense_date, is_recurring, recurring_until, notes')
    .eq('organization_id', org.id)
    .lte('expense_date', endDate)
    .or(`is_recurring.eq.true,expense_date.gte.${startDate}`)
    .order('expense_date', { ascending: false });

  return (data ?? []).map((e) => ({
    id: e.id,
    description: e.description,
    category: e.category as ExpenseCategory,
    categoryLabel: EXPENSE_CATEGORY_LABEL[e.category as ExpenseCategory] ?? e.category,
    amount: Number(e.amount),
    expense_date: e.expense_date,
    is_recurring: e.is_recurring,
    recurring_until: e.recurring_until,
    notes: e.notes,
  }));
}

export async function createExpense(raw: unknown): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const input = expenseSchema.parse(raw);
  const user = await getAuthUser();
  const supabase = createAdminClient();

  const { error } = await supabase.from('operating_expenses').insert({
    organization_id: org.id,
    description: input.description,
    category: input.category,
    amount: Math.round(input.amount * 100) / 100,
    expense_date: input.expenseDate,
    is_recurring: input.isRecurring,
    // Only meaningful for a recurring cost; stored null otherwise so a stale
    // end date cannot silently limit a one-off.
    recurring_until: input.isRecurring ? (input.recurringUntil ?? null) : null,
    notes: input.notes || null,
    created_by: user?.id ?? null,
  });

  if (error) throw new Error(`Could not save that expense: ${error.message}`);

  revalidatePath('/app/books');
}

export async function deleteExpense(id: string): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canEditInventory(role)) throw new Error('Not authorized');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('operating_expenses')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id);

  if (error) throw new Error(`Could not delete that expense: ${error.message}`);

  revalidatePath('/app/books');
}
