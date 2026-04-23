'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createCategory, deleteCategory } from '../actions';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: { id: string; name: string }[];
};

export function CategoriesDialog({ open, onOpenChange, categories }: Props) {
  const [name, setName] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        await createCategory({ name: name.trim() });
        toast.success('Category added');
        setName('');
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteCategory(id);
        toast.success('Category deleted');
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="New category name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
            <Button onClick={handleAdd} disabled={isPending || !name.trim()}>
              Add
            </Button>
          </div>

          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            <ul className="space-y-1 max-h-[280px] overflow-y-auto">
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-md hover:bg-muted px-2 py-1.5"
                >
                  <span className="text-sm">{c.name}</span>
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => handleDelete(c.id)}
                    disabled={isPending}
                    aria-label={`Delete ${c.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}