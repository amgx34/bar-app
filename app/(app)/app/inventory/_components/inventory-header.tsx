'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { canEditInventory, canManageCategories, type Role } from '@/lib/permissions';
import { ItemFormDialog } from './item-form-dialog';
import { CategoriesDialog } from './categories-dialog';

type Props = {
  role: Role;
  categories: { id: string; name: string }[];
  currentQ: string;
  currentCategory: string;
  includeInactive: boolean;
};

export function InventoryHeader({
  role, categories, currentQ, currentCategory, includeInactive,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(currentQ);
  const [addOpen, setAddOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Bottles, cans, kegs, and everything else behind the bar.
          </p>
        </div>
        <div className="flex gap-2">
          {canManageCategories(role) && (
            <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
              Categories
            </Button>
          )}
          {canEditInventory(role) && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add item
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-[200px] space-y-1">
          <Label htmlFor="search" className="sr-only">Search</Label>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Search by name…"
              className="pl-8"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') updateParams({ q: q || null });
              }}
              onBlur={() => {
                if (q !== currentQ) updateParams({ q: q || null });
              }}
            />
          </div>
        </div>

        <div className="w-[180px] space-y-1">
          <Label className="sr-only">Category</Label>
          <Select
            value={currentCategory}
            onValueChange={(v) => updateParams({ category: v === 'all' ? null : v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => updateParams({ include_inactive: includeInactive ? null : '1' })}
          disabled={isPending}
        >
          {includeInactive ? 'Hide inactive' : 'Show inactive'}
        </Button>
      </div>

      <ItemFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        categories={categories}
        mode="create"
      />
      <CategoriesDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        categories={categories}
      />
    </div>
  );
}