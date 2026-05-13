'use client';

import { useEffect, useTransition, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Calculator, Wine } from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { inventoryItemSchema, type InventoryItemInput } from '@/lib/schemas/inventory';
import { createItem, updateItem } from '../actions';
import type { ItemRow } from './inventory-table';

const UNITS = ['bottle', 'can', 'keg', 'oz', 'liter', 'case', 'each'];

const ML_TO_OZ = 0.033814;
const DEFAULT_BOTTLE_SIZES = [375, 750, 1000, 1750];

// Categories that suggest a liquor/spirits item
const LIQUOR_KEYWORDS = /spirit|liquor|whiskey|whisky|vodka|gin|rum|tequila|bourbon|scotch|mezcal|brandy|cognac/i;

type Props = {
  open:           boolean;
  onOpenChange:   (open: boolean) => void;
  categories:     { id: string; name: string }[];
  reps:           { id: string; name: string }[];
  mode:           'create' | 'edit';
  item?:          ItemRow;
  defaultPourOz?: number;        // from org bar_settings
  bottleSizesMl?: number[];      // from org bar_settings
};

export function ItemFormDialog({
  open, onOpenChange, categories, reps, mode, item,
  defaultPourOz = 1.5,
  bottleSizesMl = DEFAULT_BOTTLE_SIZES,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [isBottle, setIsBottle]      = useState(
    mode === 'edit' ? !!(item?.bottle_size_ml) : false
  );

  const {
    register, handleSubmit, reset, setValue, watch,
    formState: { errors },
  } = useForm<InventoryItemInput>({
    resolver: zodResolver(inventoryItemSchema),
    defaultValues: {
      name:           item?.name          ?? '',
      category_id:    item?.category_id   ?? null,
      rep_id:         item?.rep_id        ?? null,
      sku:            item?.sku           ?? '',
      unit:           item?.unit          ?? 'bottle',
      par_level:      item?.par_level     ?? null,
      cost_price:     item?.cost_price    ?? null,
      sale_price:     item?.sale_price    ?? null,
      current_stock:  item?.current_stock ?? 0,
      bottle_size_ml: item?.bottle_size_ml ?? null,
      pour_size_oz:   item?.pour_size_oz   ?? defaultPourOz,
    },
  });

  const currentCategory  = watch('category_id');
  const currentUnit      = watch('unit');
  const currentRep       = watch('rep_id');
  const bottleSizeMl     = watch('bottle_size_ml');
  const pourSizeOz       = watch('pour_size_oz') ?? defaultPourOz;
  const costPrice        = watch('cost_price');

  // Auto-detect liquor category
  useEffect(() => {
    const cat = categories.find(c => c.id === currentCategory);
    if (cat && LIQUOR_KEYWORDS.test(cat.name)) {
      setIsBottle(true);
      if (!watch('pour_size_oz')) setValue('pour_size_oz', defaultPourOz);
    }
  }, [currentCategory, categories, defaultPourOz, setValue, watch]);

  // Calculated values
  const bottleOz  = bottleSizeMl ? bottleSizeMl * ML_TO_OZ : null;
  const servings  = bottleOz && pourSizeOz > 0 ? bottleOz / pourSizeOz : null;
  const costPer   = servings && costPrice && costPrice > 0 ? costPrice / servings : null;

  // Available bottle sizes (settings + any existing value)
  const availableSizes = Array.from(new Set([
    ...bottleSizesMl,
    ...(item?.bottle_size_ml ? [item.bottle_size_ml] : []),
  ])).sort((a, b) => a - b);

  function bottleLabel(ml: number) {
    const oz = (ml * ML_TO_OZ).toFixed(1);
    const names: Record<number, string> = {
      50: 'Mini', 200: 'Half Pint', 375: 'Pint', 750: 'Fifth',
      1000: 'Liter', 1140: 'Quart', 1750: 'Handle',
    };
    return `${ml} ml (${oz} oz)${names[ml] ? ` — ${names[ml]}` : ''}`;
  }

  function onSubmit(values: InventoryItemInput) {
    // Clear bottle fields if user toggled off
    const data: InventoryItemInput = {
      ...values,
      bottle_size_ml: isBottle ? values.bottle_size_ml : null,
      pour_size_oz:   isBottle ? values.pour_size_oz   : null,
    };
    startTransition(async () => {
      try {
        if (mode === 'create') {
          await createItem(data);
          toast.success('Item added');
        } else if (item) {
          await updateItem(item.id, data);
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
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Add inventory item' : `Edit — ${item?.name}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* ── Identity ────────────────────────────────────────────── */}
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
                <SelectTrigger>
                  <span className="text-sm truncate">
                    {currentCategory && currentCategory !== 'none'
                      ? (categories.find(c => c.id === currentCategory)?.name ?? 'None')
                      : 'None'}
                  </span>
                </SelectTrigger>
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
              <Select value={currentUnit} onValueChange={(v) => v && setValue('unit', v)}>
                <SelectTrigger><span className="text-sm">{currentUnit}</span></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
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
                  <span className="text-sm truncate">
                    {currentRep && currentRep !== 'none'
                      ? (reps.find(r => r.id === currentRep)?.name ?? 'None')
                      : 'None'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="sku">SKU / Code</Label>
            <Input id="sku" {...register('sku')} placeholder="Optional" />
          </div>

          {/* ── Pricing & stock ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cost_price">Cost price</Label>
              <Input id="cost_price" type="number" step="0.01" min="0"
                {...register('cost_price', { setValueAs: (v) => v === '' ? null : parseFloat(v) })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sale_price">Sale price</Label>
              <Input id="sale_price" type="number" step="0.01" min="0"
                {...register('sale_price', { setValueAs: (v) => v === '' ? null : parseFloat(v) })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="par_level">Par level</Label>
              <Input id="par_level" type="number" step="0.01" min="0" placeholder="Target stock"
                {...register('par_level', { setValueAs: (v) => v === '' ? null : parseFloat(v) })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="current_stock">
                {mode === 'create' ? 'Starting stock' : 'Current stock'}
              </Label>
              <Input id="current_stock" type="number" step="0.01" min="0"
                disabled={mode === 'edit'}
                {...register('current_stock', { valueAsNumber: true })} />
              {mode === 'edit' && (
                <p className="text-xs text-muted-foreground">Use &quot;Adjust stock&quot; to change.</p>
              )}
            </div>
          </div>

          {/* ── Liquor / bottle toggle ───────────────────────────────── */}
          <div className="border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => {
                const next = !isBottle;
                setIsBottle(next);
                if (next && !watch('pour_size_oz')) setValue('pour_size_oz', defaultPourOz);
                if (!next) { setValue('bottle_size_ml', null); setValue('pour_size_oz', null); }
              }}
              className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            >
              <Wine className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Track as liquor / spirits bottle</p>
                <p className="text-xs text-muted-foreground">
                  Unlocks bottle size, pour tracking, and cost-per-pour
                </p>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors relative ${isBottle ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                <div className={`absolute top-0.5 h-4 w-4 bg-white rounded-full shadow transition-transform ${isBottle ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </button>

            {isBottle && (
              <div className="px-4 pb-4 pt-3 space-y-4 border-t">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Bottle Size</Label>
                    <Select
                      value={bottleSizeMl ? String(bottleSizeMl) : 'none'}
                      onValueChange={(v) => setValue('bottle_size_ml', !v || v === 'none' ? null : parseInt(v))}
                    >
                      <SelectTrigger>
                        <span className="text-sm truncate">
                          {bottleSizeMl ? `${bottleSizeMl} ml` : 'Select size'}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select size…</SelectItem>
                        {availableSizes.map((ml) => (
                          <SelectItem key={ml} value={String(ml)}>{bottleLabel(ml)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pour_size_oz">Pour Size</Label>
                    <div className="relative">
                      <Input id="pour_size_oz" type="number" min="0.25" step="0.25"
                        {...register('pour_size_oz', { setValueAs: (v) => v === '' ? null : parseFloat(v) })}
                        placeholder={String(defaultPourOz)} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">oz</span>
                    </div>
                  </div>
                </div>

                {/* Live calculations */}
                {servings !== null && (
                  <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                      <Calculator className="h-3.5 w-3.5" /> Auto-calculated
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Bottle volume</span>
                        <span className="tabular-nums">{bottleOz?.toFixed(1)} oz</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Servings / bottle</span>
                        <span className="tabular-nums font-semibold text-foreground">{servings.toFixed(1)}</span>
                      </div>
                      {costPer !== null && (
                        <div className="flex justify-between col-span-2">
                          <span>Cost per pour</span>
                          <span className="tabular-nums font-semibold text-foreground">${costPer.toFixed(3)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
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
