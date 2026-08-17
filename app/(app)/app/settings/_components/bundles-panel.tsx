'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Package, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  saveBundle,
  deleteBundle,
  type BundleRow,
  type InventoryOption,
} from '../bundle-actions';

type Props = {
  bundles: BundleRow[];
  options: InventoryOption[];
  canEdit: boolean;
};

type DraftComponent = { inventory_item_id: string; quantity: string };

const EMPTY_COMPONENT: DraftComponent = { inventory_item_id: '', quantity: '1' };

export function BundlesPanel({ bundles, options, canEdit }: Props) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [components, setComponents] = useState<DraftComponent[]>([{ ...EMPTY_COMPONENT }]);

  function reset() {
    setEditingId(null);
    setName('');
    setComponents([{ ...EMPTY_COMPONENT }]);
  }

  function startNew() {
    setEditingId('new');
    setName('');
    setComponents([{ ...EMPTY_COMPONENT }]);
  }

  function startEdit(bundle: BundleRow) {
    setEditingId(bundle.id);
    setName(bundle.item_name);
    setComponents(
      bundle.components.map((c) => ({
        inventory_item_id: c.inventory_item_id,
        quantity: String(c.quantity),
      })),
    );
  }

  function setComponent(index: number, patch: Partial<DraftComponent>) {
    setComponents((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  }

  function save() {
    const parsed = components
      .filter((c) => c.inventory_item_id)
      .map((c) => ({
        inventory_item_id: c.inventory_item_id,
        quantity: Number(c.quantity),
      }));

    if (!name.trim()) {
      toast.error('Enter the deal name exactly as the POS reports it');
      return;
    }
    if (parsed.length === 0) {
      toast.error('Add at least one item the deal is made of');
      return;
    }
    if (parsed.some((c) => !Number.isFinite(c.quantity) || c.quantity <= 0)) {
      toast.error('Every quantity must be greater than zero');
      return;
    }

    startTransition(async () => {
      try {
        const { unexcluded, deactivated } = await saveBundle({
          item_name: name,
          components: parsed,
        });

        // Both side effects are surfaced rather than silent: each one changes
        // something the operator can see elsewhere in the app.
        const notes = [
          deactivated > 0 && 'removed it from stock',
          unexcluded && 'un-excluded it from POS sync',
        ].filter(Boolean);

        toast.success(
          notes.length
            ? `Saved — also ${notes.join(' and ')}`
            : `${name.trim()} saved`,
        );
        reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save that deal');
      }
    });
  }

  function remove(bundle: BundleRow) {
    startTransition(async () => {
      try {
        await deleteBundle(bundle.id);
        toast.success(`${bundle.item_name} is no longer a deal`);
        if (editingId === bundle.id) reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not delete that deal');
      }
    });
  }

  const nameById = new Map(options.map((o) => [o.id, o.name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" aria-hidden />
          Deals &amp; bundles
        </CardTitle>
        <CardDescription>
          A deal rings up as one item but empties several. Tell Rail what
          &ldquo;Bucket of 5 Domestic&rdquo; is made of and every sale will draw down the
          real stock instead of creating a phantom item. Use this instead of excluding
          the deal — an excluded item is ignored entirely, so nothing gets depleted.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {bundles.length === 0 && editingId === null && (
          <p className="text-sm text-muted-foreground">
            No deals defined. Combos and buckets are syncing as ordinary items.
          </p>
        )}

        {bundles.length > 0 && (
          <ul className="divide-y divide-border border-y border-border">
            {bundles.map((bundle) => (
              <li key={bundle.id} className="flex items-start gap-3 py-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">
                    {bundle.item_name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {bundle.components.length === 0
                      ? 'No components — this deal depletes nothing'
                      : bundle.components
                          .map((c) => `${c.quantity} × ${c.item_name}`)
                          .join(', ')}
                  </span>
                </span>
                {canEdit && (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(bundle)}
                      disabled={isPending}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(bundle)}
                      disabled={isPending}
                      aria-label={`Delete deal ${bundle.item_name}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && editingId === null && (
          <Button onClick={startNew} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden />
            Add a deal
          </Button>
        )}

        {canEdit && editingId !== null && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bundle-name">Deal name, as the POS reports it</Label>
              <Input
                id="bundle-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bucket of 5 Domestic"
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium mb-2">What it&rsquo;s made of</legend>

              {options.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active inventory items yet. Add the stock first, then come back and
                  build the recipe.
                </p>
              ) : (
                components.map((component, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <div className="w-20 shrink-0 space-y-1.5">
                      <Label htmlFor={`bundle-qty-${index}`} className="text-xs">
                        Qty
                      </Label>
                      <Input
                        id={`bundle-qty-${index}`}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={component.quantity}
                        onChange={(e) => setComponent(index, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <Label htmlFor={`bundle-item-${index}`} className="text-xs">
                        Item
                      </Label>
                      <Select
                        value={component.inventory_item_id}
                        onValueChange={(v) =>
                          setComponent(index, { inventory_item_id: (v ?? '') as string })
                        }
                      >
                        <SelectTrigger id={`bundle-item-${index}`} className="w-full h-9">
                          <SelectValue placeholder="Choose an item" />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setComponents((prev) =>
                          prev.length === 1
                            ? [{ ...EMPTY_COMPONENT }]
                            : prev.filter((_, i) => i !== index),
                        )
                      }
                      aria-label={
                        component.inventory_item_id
                          ? `Remove ${nameById.get(component.inventory_item_id) ?? 'component'}`
                          : `Remove component ${index + 1}`
                      }
                      className="mb-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ))
              )}

              {options.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setComponents((prev) => [...prev, { ...EMPTY_COMPONENT }])}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add another item
                </Button>
              )}
            </fieldset>

            <div className="flex items-center gap-2 pt-1">
              <Button onClick={save} disabled={isPending || options.length === 0}>
                {editingId === 'new' ? 'Create deal' : 'Save changes'}
              </Button>
              <Button variant="ghost" onClick={reset} disabled={isPending}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
