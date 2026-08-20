'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Search, Plus, ChevronDown, Settings2, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { canEditInventory, canManageCategories, type Role } from '@/lib/permissions';
import { ItemFormDialog } from './item-form-dialog';
import { CategoriesDialog } from './categories-dialog';
import { InventoryImportDialog } from './inventory-import-dialog';

type Props = {
  role: Role;
  categories:    { id: string; name: string }[];
  reps:          { id: string; name: string }[];
  currentQ:      string;
  currentCategory: string;
  includeInactive: boolean;
  defaultPourOz?:  number;
  bottleSizesMl?:  number[];
};

const STOCK_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'In Stock', value: 'in_stock' },
  { label: 'Low Stock', value: 'low_stock' },
];

export function InventoryHeader({
  role, categories, reps, currentQ, currentCategory, includeInactive,
  defaultPourOz, bottleSizesMl,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [panelOpen, setPanelOpen] = useState(true);
  const [q, setQ] = useState(currentQ);
  const [addOpen, setAddOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const currentStock = searchParams.get('stock') ?? 'all';

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    startTransition(() => {
      router.push(`/app/inventory?${next.toString()}`);
    });
  }

  return (
    <div className="border-b border-border/60">
      {/* Collapsible filter panel */}
      <div
        className="overflow-hidden"
        style={{
          // 400px, not 200: on a phone these filters wrap onto several rows and a
          // 200px cap silently clipped the action buttons off the bottom.
          maxHeight: panelOpen ? '400px' : '0px',
          opacity: panelOpen ? 1 : 0,
          transition: 'max-height 0.35s ease, opacity 0.25s ease',
        }}
      >
        <div className="px-5 py-3 flex flex-wrap gap-3 items-center bg-background">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search items…"
              className="pl-8 h-9 bg-card border-border/60 focus-visible:ring-primary/40"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && updateParams({ q: q || null })}
              onBlur={() => q !== currentQ && updateParams({ q: q || null })}
            />
          </div>

          {/* Category filter */}
          <Select
            value={currentCategory || 'all'}
            onValueChange={(v) => updateParams({ category: v === 'all' ? null : v })}
          >
            <SelectTrigger className="w-[160px] h-9 bg-card border-border/60">
              <span className="truncate text-sm">
                {!currentCategory || currentCategory === 'all'
                  ? 'All categories'
                  : (categories.find((c) => c.id === currentCategory)?.name ?? 'All categories')}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Stock filter chips */}
          <div className="flex gap-1.5">
            {STOCK_FILTERS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => updateParams({ stock: value === 'all' ? null : value })}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-all duration-200',
                  currentStock === value || (value === 'all' && currentStock === 'all')
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Action buttons.
              Wraps, and only pushes right once there is room to. `ml-auto` on a
              phone shoved this group past the panel's right edge, and the panel
              clips with overflow-hidden — so "Add item", the primary action on
              this screen, was invisible and unreachable rather than merely
              awkward. */}
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:ml-auto">
            {canManageCategories(role) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCategoriesOpen(true)}
                className="h-9 border-border/60"
              >
                <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                Categories
              </Button>
            )}
            {canEditInventory(role) && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImportOpen(true)}
                  className="h-9 border-border/60 text-primary hover:text-primary"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  AI Import
                </Button>
                <Button
                  size="sm"
                  onClick={() => setAddOpen(true)}
                  className="h-9"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add item
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateParams({ include_inactive: includeInactive ? null : '1' })}
              className="h-9 text-muted-foreground hover:text-foreground"
            >
              {includeInactive ? 'Hide inactive' : 'Show inactive'}
            </Button>
          </div>
        </div>
      </div>

      {/* Slide toggle */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="w-full flex items-center justify-center gap-3 py-1.5 bg-card hover:bg-muted/40 transition-colors group"
        aria-label={panelOpen ? 'Collapse filters' : 'Expand filters'}
      >
        <div className="h-px w-10 bg-border group-hover:bg-primary/50 transition-colors" />
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-all duration-300',
            panelOpen && 'rotate-180'
          )}
        />
        <div className="h-px w-10 bg-border group-hover:bg-primary/50 transition-colors" />
      </button>

      <ItemFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        categories={categories}
        reps={reps}
        mode="create"
        defaultPourOz={defaultPourOz}
        bottleSizesMl={bottleSizesMl}
      />
      <CategoriesDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        categories={categories}
      />
      <InventoryImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </div>
  );
}
