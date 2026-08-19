'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Trash2, Info } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  COST_TYPE_LABEL, COST_TYPE_HELP, type CostType,
} from '@/lib/books/cost-structure';
import { createCategory, deleteCategory, updateCategoryCostType, updateCategoryPour } from '../actions';

type Category = { id: string; name: string; cost_type?: string | null; default_pour_oz?: number | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
};

const COST_TYPES = Object.keys(COST_TYPE_LABEL) as CostType[];

/** Short form for the row; the full explanation lives in the help text below. */
const SHORT_LABEL: Record<CostType, string> = {
  beverage_cogs: 'Beverage',
  food_cogs: 'Food',
  supplies: 'Supplies',
  excluded: 'Not counted',
};

export function CategoriesDialog({ open, onOpenChange, categories }: Props) {
  const [name, setName] = useState('');
  const [isPending, startTransition] = useTransition();
  // Which row's help is expanded. Progressive disclosure: four classifications
  // each need a sentence, and showing all four at once buries the list.
  const [explaining, setExplaining] = useState<string | null>(null);

  function handleAdd() {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        await createCategory({ name: name.trim() });
        setName('');
        toast.success('Category added');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not add that category');
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteCategory(id);
        toast.success('Category removed');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove that category');
      }
    });
  }

  function handlePour(category: Category, raw: string) {
    const trimmed = raw.trim();
    const pour = trimmed === '' ? null : Number(trimmed);
    if (pour !== null && (!Number.isFinite(pour) || pour <= 0)) {
      toast.error('Enter a pour size greater than zero, or leave it blank');
      return;
    }
    startTransition(async () => {
      try {
        await updateCategoryPour(category.id, pour);
        toast.success(
          pour === null
            ? `${category.name} no longer has a default pour`
            : `${category.name} pours ${pour}oz`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update that pour size');
      }
    });
  }

  function handleCostType(category: Category, costType: CostType) {
    startTransition(async () => {
      try {
        await updateCategoryCostType(category.id, costType);
        toast.success(`${category.name} counts as ${SHORT_LABEL[costType].toLowerCase()}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update that category');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
          <DialogDescription>
            How each category is counted decides your pour cost. Napkins and cups are
            a real cost, but they are not poured — classing them as Supplies keeps
            them out of the ratio while still subtracting them from profit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
              placeholder="New category name"
              aria-label="New category name"
            />
            <Button onClick={handleAdd} disabled={isPending || !name.trim()}>
              Add
            </Button>
          </div>

          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border max-h-[340px] overflow-y-auto">
              {categories.map((c) => {
                const costType = (COST_TYPES.includes(c.cost_type as CostType)
                  ? c.cost_type
                  : 'beverage_cogs') as CostType;

                return (
                  <li key={c.id} className="py-2">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 truncate text-sm font-medium">{c.name}</span>

                      <Select
                        value={costType}
                        onValueChange={(v) => handleCostType(c, (v ?? 'beverage_cogs') as CostType)}
                      >
                        <SelectTrigger
                          className="h-8 w-[9.5rem]"
                          aria-label={`How ${c.name} is counted`}
                        >
                          {/* Without a formatter this reads "beverage_cogs"
                              rather than "Beverage" — Base UI renders the raw
                              value, not the chosen item's label. */}
                          <SelectValue>
                            {(value) => SHORT_LABEL[value as CostType] ?? SHORT_LABEL[costType]}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {COST_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{SHORT_LABEL[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Only offered for cost-of-sales categories: a pour size
                          on napkins would be meaningless, and an input that does
                          nothing is worse than no input. */}
                      {(costType === 'beverage_cogs' || costType === 'food_cogs') && (
                        <Input
                          type="number" min="0" step="0.25" inputMode="decimal"
                          defaultValue={c.default_pour_oz ?? ''}
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            const current = c.default_pour_oz == null ? '' : String(c.default_pour_oz);
                            if (next !== current) handlePour(c, next);
                          }}
                          aria-label={`Default pour for ${c.name}, in ounces`}
                          placeholder="oz"
                          className="h-8 w-[4.5rem] shrink-0"
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => setExplaining(explaining === c.id ? null : c.id)}
                        aria-expanded={explaining === c.id}
                        aria-label={`What does ${SHORT_LABEL[costType]} mean?`}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors cursor-pointer"
                      >
                        <Info className="h-4 w-4" aria-hidden />
                      </button>

                      <Button
                        variant="ghost" size="icon"
                        onClick={() => handleDelete(c.id)}
                        disabled={isPending}
                        aria-label={`Delete ${c.name}`}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>

                    {explaining === c.id && (
                      <p className="mt-1.5 pl-1 pr-10 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {COST_TYPE_LABEL[costType]}
                        </span>{' '}
                        — {COST_TYPE_HELP[costType]}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Pour (oz)</span> is what one
            sale takes out of a container. A 1.5oz pour from a 750ml bottle deducts a
            seventeenth of it, instead of a whole bottle. Leave blank for anything sold
            as a whole unit, like bottled beer.
          </p>

          <p className="text-xs text-muted-foreground">
            Changes apply to the Books page immediately, including past periods —
            reclassifying restates history rather than only affecting new purchases.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
