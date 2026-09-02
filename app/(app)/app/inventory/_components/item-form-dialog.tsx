'use client';

import { useEffect, useTransition, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowUpRight, Calculator, Info, Wine } from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { describePour } from '@/lib/pos/pour';
import { isMixedDrinkCategory } from '@/lib/pos/setup-gaps';
import { inventoryItemSchema, type InventoryItemInput } from '@/lib/schemas/inventory';
import { createItem, updateItem } from '../actions';
import type { ItemRow } from './inventory-table';
import { hasPack, toSingles } from '@/lib/inventory/packs';

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
      units_per_pack: item?.units_per_pack ?? null,
    },
  });

  const currentCategory  = watch('category_id');
  const currentUnit      = watch('unit');
  const currentRep       = watch('rep_id');
  const bottleSizeMl     = watch('bottle_size_ml');
  const pourSizeOz       = watch('pour_size_oz') ?? defaultPourOz;
  const unitsPerPack     = watch('units_per_pack');
  const costPrice        = watch('cost_price');
  const salePrice        = watch('sale_price');

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

  /**
   * A mixed drink sitting in inventory as though it were a bottle.
   *
   * The ingest auto-creates an item for every POS menu name, so "Lemon Drop"
   * arrives here as stock. This form then asks for a cost per unit — a question
   * with no sensible answer, because nobody buys Lemon Drops by the case — and
   * every sale depletes a phantom while the vodka it was poured from never
   * moves. Naming that here is the difference between a confusing form and one
   * that tells you where to go.
   *
   * Same category test the setup report uses, so the two cannot disagree.
   */
  const categoryName = categories.find((c) => c.id === currentCategory)?.name ?? null;
  const looksMixed = isMixedDrinkCategory(categoryName) && !isBottle;

  // Derived from the SAME helper the ingest route depletes with, so the
  // explanation below cannot drift from the arithmetic it describes. That is
  // exactly what describePour exists for — a separately-written explanation is
  // how this screen ended up claiming pour size was "for costing only".
  const pour = describePour(
    {
      bottleSizeMl: bottleSizeMl ?? null,
      pourSizeOz: watch('pour_size_oz') ?? null,
    },
    { orgPourOz: defaultPourOz },
  );

  // Margin on one sale, which is the figure an operator is actually pricing
  // against. Compared against cost-per-pour when the item is poured and against
  // the flat unit cost when it is not — mixing the two is precisely the
  // confusion this panel exists to remove.
  const unitCostOfOneSale = isBottle && costPer !== null ? costPer : (costPrice ?? null);
  const margin =
    salePrice != null && salePrice > 0 && unitCostOfOneSale != null
      ? salePrice - unitCostOfOneSale
      : null;
  const marginPct =
    margin !== null && salePrice ? (margin / salePrice) * 100 : null;

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
          {looksMixed && (
            <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-xs leading-relaxed">
              <p className="font-medium text-sky-800 dark:text-sky-200">
                This looks like a mixed drink, not something you buy.
              </p>
              <p className="mt-1 text-sky-800/90 dark:text-sky-200/90">
                A cost per {currentUnit} only makes sense for stock that arrives in a
                {' '}{currentUnit}. Because &ldquo;{watch('name') || 'this item'}&rdquo; is
                held here as its own stock item, every sale takes one off this count and
                the liquor it is actually poured from never moves.
              </p>
              <p className="mt-1.5 text-sky-800/90 dark:text-sky-200/90">
                Give it a <strong>recipe</strong> instead — the bottles it is made from,
                and how much of each. Then a sale draws down the real stock and the cost
                works itself out.
              </p>
              <a
                href="/app/inventory/setup"
                className="mt-2 inline-flex items-center gap-1 font-medium text-sky-700 underline underline-offset-2 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
              >
                Set up a recipe
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
          )}

          {/* The two prices are measured in DIFFERENT units, and labelling them
              both "price" is what made this screen unreadable. Cost is what you
              pay a distributor for one {unit}. Sale price is what the POS
              charges for one thing on the menu — a shot, not a bottle. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cost_price">Cost per {currentUnit}</Label>
              <Input id="cost_price" type="number" step="0.01" min="0"
                {...register('cost_price', { setValueAs: (v) => v === '' ? null : parseFloat(v) })} />
              <p className="text-xs text-muted-foreground">
                What you pay for one {currentUnit} from the supplier.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sale_price">
                Menu price {isBottle ? 'per pour' : `per ${currentUnit}`}
              </Label>
              <Input id="sale_price" type="number" step="0.01" min="0"
                {...register('sale_price', { setValueAs: (v) => v === '' ? null : parseFloat(v) })} />
              <p className="text-xs text-muted-foreground">
                {isBottle
                  ? 'What a customer pays for one pour of this.'
                  : `What a customer pays for one ${currentUnit}.`}
              </p>
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

          {/* ── Pack size ─────────────────────────────────────────────
              Only for goods sold as sealed units. A liquid item counts by
              volume, where a "pack" has no meaning. */}
          {!isBottle && (
            <div className="space-y-1">
              <Label htmlFor="units_per_pack">
                Singles per {currentUnit === 'each' ? 'pack' : currentUnit}{' '}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="units_per_pack" type="number" step="1" min="2"
                placeholder="e.g. 24 for a case of cans"
                {...register('units_per_pack', {
                  setValueAs: (v) => v === '' || v === null ? null : parseInt(v, 10),
                })}
              />
              <p className="text-xs text-muted-foreground">
                {hasPack(unitsPerPack)
                  ? `Lets you receive and count in ${currentUnit}s — "2 + 9 loose" is stored as ${toSingles({ packs: 2, loose: 9 }, unitsPerPack)} singles.`
                  : 'Set this to enter deliveries and counts by the case. Stock is always stored in singles, and each sale still removes one.'}
              </p>
            </div>
          )}

          {/* ── Liquor / bottle toggle ───────────────────────────────── */}
          <div className="border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => {
                const next = !isBottle;
                setIsBottle(next);
                if (next && !watch('pour_size_oz')) setValue('pour_size_oz', defaultPourOz);
                if (next) setValue('units_per_pack', null);
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

                {/* A pour size with no container size is the misconfiguration
                    that silently deducts a whole bottle per shot. describePour
                    detects it; without this the item just looks fine. */}
                {pour.warning && (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                    {pour.warning}
                  </p>
                )}

                {/* Live calculations, written as a sentence first.
                    A grid of labelled numbers assumes the reader already knows
                    how the numbers relate; the sentence is what a bar manager
                    can check against reality without being taught the model. */}
                {servings !== null && (
                  <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-2">
                    <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                      <Calculator className="h-3.5 w-3.5" /> What this works out to
                    </p>

                    <p className="text-sm leading-relaxed">
                      One {bottleSizeMl} ml bottle holds{' '}
                      <strong className="tabular-nums">{bottleOz?.toFixed(1)} oz</strong>, so at a{' '}
                      <strong className="tabular-nums">{pourSizeOz} oz</strong> pour you get about{' '}
                      <strong className="tabular-nums">{servings.toFixed(1)} pours</strong> out of it.
                      {costPer !== null && (
                        <> Each pour costs you{' '}
                          <strong className="tabular-nums">${costPer.toFixed(2)}</strong>.</>
                      )}
                      {margin !== null && marginPct !== null && (
                        <> Selling it at{' '}
                          <strong className="tabular-nums">${salePrice?.toFixed(2)}</strong> leaves{' '}
                          <strong className="tabular-nums">${margin.toFixed(2)}</strong> a pour
                          ({marginPct.toFixed(0)}% margin).</>
                      )}
                    </p>

                    {costPer === null && (
                      <p className="text-xs text-muted-foreground">
                        Enter a cost per {currentUnit} to see cost per pour.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* The single most-asked question about this screen, answered where it
              is asked. Stock depletes one unit per POS item sold — there is no
              pour-to-bottle conversion anywhere in the pipeline, so saying
              otherwise here would be a comforting lie. */}
          <details className="rounded-xl border bg-muted/20 group">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
              <Info className="h-4 w-4 text-muted-foreground shrink-0" />
              How does stock tracking actually work?
            </summary>
            <div className="space-y-2 border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">Stock is counted in {currentUnit}s.</strong>{' '}
                &ldquo;Current stock: 8&rdquo; means eight {currentUnit}s on the shelf.
              </p>
              <p>
                <strong className="text-foreground">
                  {pour.pourOz === null
                    ? `Every POS sale removes one whole ${currentUnit}.`
                    : `Every POS sale removes one ${pour.pourOz} oz pour.`}
                </strong>{' '}
                {pour.pourOz === null
                  ? `Nothing here is sold by the pour, so ringing up 12 drops stock by 12 ${currentUnit}s.`
                  : `Ringing up 12 drops stock by about ${(pour.unitsPerSale * 12).toFixed(2)} ${currentUnit}s, not by 12.`}
              </p>
              <p>
                <strong className="text-foreground">
                  Pouring needs BOTH a container size and a pour size.
                </strong>{' '}
                A pour size on its own cannot say what fraction of anything it is,
                so the sale falls back to one whole {currentUnit}. The pour is taken
                from this item, or its category, or the bar-wide default &mdash; in
                that order.
                {pour.source !== 'none' && (
                  <> This one is currently coming from{' '}
                    <strong className="text-foreground">
                      {pour.source === 'item' ? 'this item' : `the ${pour.source} default`}
                    </strong>.
                  </>
                )}
              </p>
              <p>
                <strong className="text-foreground">
                  To correct stock, use Adjust stock &rarr; Physical count.
                </strong>{' '}
                That is the only thing that sets the number to what is really on
                the shelf.
              </p>
              <p>
                <strong className="text-foreground">Weigh sessions do not change stock.</strong>{' '}
                They measure what was actually poured, in ounces, and cost the
                variance against your bottle cost. Treat them as a report on
                pouring, not as a stock count.
              </p>
            </div>
          </details>

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
