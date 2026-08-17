'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Ban, Plus, X, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  excludeItem,
  removeExclusion,
  type ExcludedItem,
} from '../excluded-items-actions';

type Props = {
  items: ExcludedItem[];
  suggestions: string[];
  canEdit: boolean;
};

export function ExcludedItemsPanel({ items, suggestions, canEdit }: Props) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  // Suggestions the operator has dismissed this session — kept local so a
  // dismissal does not need a round trip or a schema column.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  function add(itemName: string, itemReason?: string) {
    if (!itemName.trim()) {
      toast.error('Enter the item name exactly as the POS reports it');
      return;
    }
    startTransition(async () => {
      try {
        const { deactivated } = await excludeItem({
          item_name: itemName,
          reason: itemReason || undefined,
          deactivateExisting: true,
        });
        toast.success(
          deactivated > 0
            ? `${itemName} excluded and removed from stock`
            : `${itemName} excluded from POS sync`,
        );
        setName('');
        setReason('');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not exclude that item');
      }
    });
  }

  function remove(id: string, itemName: string) {
    startTransition(async () => {
      try {
        await removeExclusion(id);
        toast.success(`${itemName} will sync again from the next POS pull`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove that exclusion');
      }
    });
  }

  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(s));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="h-4 w-4 text-primary" aria-hidden />
          Items excluded from POS sync
        </CardTitle>
        <CardDescription>
          Your POS lists everything that rings up, including deals and combos like
          &ldquo;Bucket of 5&rdquo; or &ldquo;2-for-1 Well&rdquo;. Those are prices, not stock —
          excluding them keeps phantom items out of inventory and stops them skewing par
          levels.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {canEdit && visibleSuggestions.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="flex items-center gap-2 font-heading text-sm font-semibold">
              <Lightbulb className="h-4 w-4 text-accent-text" aria-hidden />
              These look like deals
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Matched on name only — check each one before excluding it.
            </p>
            <ul className="flex flex-wrap gap-2 mt-3">
              {visibleSuggestions.map((s) => (
                <li key={s} className="inline-flex items-center gap-1 rounded-lg border border-border bg-card pl-3 pr-1 py-1">
                  <span className="text-sm">{s}</span>
                  <button
                    type="button"
                    onClick={() => add(s, 'Detected as a deal')}
                    disabled={isPending}
                    className="ml-1 rounded px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Exclude
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissed((prev) => new Set(prev).add(s))}
                    aria-label={`Dismiss suggestion ${s}`}
                    className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canEdit && (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="exclude-name">Item name</Label>
              <Input
                id="exclude-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bucket of 5 Domestic"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exclude-reason">Reason (optional)</Label>
              <Input
                id="exclude-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Combo, not stock"
              />
            </div>
            <Button onClick={() => add(name, reason)} disabled={isPending} className="gap-1.5">
              <Plus className="h-4 w-4" aria-hidden />
              Exclude
            </Button>
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing excluded yet. Every item your POS reports is syncing into inventory.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{item.item_name}</span>
                  {item.reason && (
                    <span className="block text-xs text-muted-foreground truncate">{item.reason}</span>
                  )}
                </span>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(item.id, item.item_name)}
                    disabled={isPending}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
