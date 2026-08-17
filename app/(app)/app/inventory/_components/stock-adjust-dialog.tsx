'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  stockAdjustmentSchema, type StockAdjustmentInput,
} from '@/lib/schemas/inventory';
import { adjustStock } from '../actions';
import type { ItemRow } from './inventory-table';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemRow;
  /**
   * Reports the expected new stock so the table can show it immediately.
   * Must be called inside the same transition as the server action, or React
   * discards the optimistic value before the request even starts.
   */
  onOptimisticStock?: (adjustment: { id: string; newStock: number }) => void;
};

const REASONS = [
  { value: 'recount',     label: 'Physical count' },
  { value: 'delivery',    label: 'Delivery received' },
  { value: 'spillage',    label: 'Spillage / broken' },
  { value: 'comp',        label: 'Comped drink' },
  { value: 'staff_drink', label: 'Staff drink' },
  { value: 'other',       label: 'Other' },
];

export function StockAdjustDialog({ open, onOpenChange, item, onOptimisticStock }: Props) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<'set' | 'delta'>('delta');

  const {
    register, handleSubmit, setValue, reset, formState: { errors },
  } = useForm<StockAdjustmentInput>({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: {
      item_id: item.id,
      mode: 'delta',
      quantity: 0,
      reason: 'delivery',
      note: '',
    },
  });

  function handleModeChange(v: string) {
    const next = v as 'set' | 'delta';
    setMode(next);
    setValue('mode', next);
  }

  function onSubmit(values: StockAdjustmentInput) {
    // Mirrors the server's arithmetic in app/(app)/app/inventory/actions.ts.
    // Only a prediction — the server remains the authority, and React reverts
    // this automatically if the action throws.
    const predicted =
      values.mode === 'set'
        ? values.quantity
        : item.current_stock + values.quantity;

    startTransition(async () => {
      // Inside the transition, so the optimistic value survives until the
      // action settles rather than being dropped on the next render.
      onOptimisticStock?.({ id: item.id, newStock: Math.max(predicted, 0) });

      try {
        await adjustStock(values);
        toast.success('Stock updated');
        onOpenChange(false);
        reset();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Adjust stock — {item.name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="text-sm bg-muted rounded-md p-3">
            Current stock: <span className="font-medium">{item.current_stock} {item.unit}</span>
          </div>

          <Tabs value={mode} onValueChange={handleModeChange}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="delta">Add / Remove</TabsTrigger>
              <TabsTrigger value="set">Set exact count</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-1">
            <Label htmlFor="quantity">
              {mode === 'delta'
                ? 'Quantity (negative to remove)'
                : 'New stock count'}
            </Label>
            <Input
              id="quantity" type="number" step="0.01"
              placeholder={mode === 'delta' ? 'e.g. 12 or -2' : 'e.g. 48'}
              {...register('quantity', { valueAsNumber: true })}
            />
            {errors.quantity && (
              <p className="text-xs text-destructive">{errors.quantity.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Reason</Label>
            <Select defaultValue="delivery" onValueChange={(v) => setValue('reason', v as StockAdjustmentInput['reason'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note" rows={2}
              placeholder="e.g. Invoice #1234"
              {...register('note')}
            />
          </div>

          <DialogFooter>
            <Button
              type="button" variant="outline"
              onClick={() => onOpenChange(false)} disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save adjustment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}