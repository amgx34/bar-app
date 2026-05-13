'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { inventoryItemSchema, type InventoryItemInput } from '@/lib/schemas/inventory';
import { createItem, updateItem } from '../actions';
import type { ItemRow } from './inventory-table';

type Props = {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  categories:    { id: string; name: string }[];
  reps:          { id: string; name: string }[];
  mode:          'create' | 'edit';
  item?:         ItemRow;
};

const UNITS = ['bottle', 'can', 'keg', 'oz', 'liter', 'case', 'each'];

export function ItemFormDialog({ open, onOpenChange, categories, reps, mode, item }: Props) {
  const [isPending, startTransition] = useTransition();

  const {
    register, handleSubmit, reset, setValue, watch, formState: { errors },
  } = useForm<InventoryItemInput>({
    resolver: zodResolver(inventoryItemSchema),
    defaultValues: {
      name:          item?.name          ?? '',
      category_id:   item?.category_id   ?? null,
      rep_id:        item?.rep_id        ?? null,
      sku:           item?.sku           ?? '',
      unit:          item?.unit          ?? 'bottle',
      par_level:     item?.par_level     ?? null,
      cost_price:    item?.cost_price    ?? null,
      sale_price:    item?.sale_price    ?? null,
      current_stock: item?.current_stock ?? 0,
    },
  });

  const currentCategory = watch('category_id');
  const currentUnit     = watch('unit');
  const currentRep      = watch('rep_id');

  function onSubmit(values: InventoryItemInput) {
    startTransition(async () => {
      try {
        if (mode === 'create') {
          await createItem(values);
          toast.success('Item added');
        } else if (item) {
          await updateItem(item.id, values);
          toast.success('Item updated');
        }
        onOpenChange(false);
        reset();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Add inventory item' : `Edit ${item?.name}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                value={currentCategory ?? 'none'}
                onValueChange={(v) => setValue('category_id', v === 'none' ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Unit *</Label>
              <Select
                value={currentUnit}
                onValueChange={(v) => v !== null && setValue('unit', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Rep / Supplier */}
          {reps.length > 0 && (
            <div className="space-y-1">
              <Label>Rep / Supplier</Label>
              <Select
                value={currentRep ?? 'none'}
                onValueChange={(v) => setValue('rep_id', v === 'none' ? null : v)}
              >
                <SelectTrigger>
                  <span className="truncate text-sm">
                    {currentRep && currentRep !== 'none'
                      ? (reps.find((r) => r.id === currentRep)?.name ?? 'Select rep')
                      : 'None'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {reps.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" {...register('sku')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cost_price">Cost price</Label>
              <Input
                id="cost_price" type="number" step="0.01" min="0"
                {...register('cost_price', { setValueAs: (v) => v === '' ? null : parseFloat(v) })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sale_price">Sale price</Label>
              <Input
                id="sale_price" type="number" step="0.01" min="0"
                {...register('sale_price', { setValueAs: (v) => v === '' ? null : parseFloat(v) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="par_level">Par level</Label>
              <Input
                id="par_level" type="number" step="0.01" min="0"
                placeholder="Target stock"
                {...register('par_level', { setValueAs: (v) => v === '' ? null : parseFloat(v) })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="current_stock">
                {mode === 'create' ? 'Starting stock' : 'Current stock'}
              </Label>
              <Input
                id="current_stock" type="number" step="0.01" min="0"
                disabled={mode === 'edit'}
                {...register('current_stock', { valueAsNumber: true })}
              />
              {mode === 'edit' && (
                <p className="text-xs text-muted-foreground">Use &quot;Adjust stock&quot; to change this.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : mode === 'create' ? 'Add item' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
