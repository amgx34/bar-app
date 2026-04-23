'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { deactivateItem, reactivateItem } from '../actions';
import type { ItemRow } from './inventory-table';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemRow;
};

export function DeactivateDialog({ open, onOpenChange, item }: Props) {
  const [isPending, startTransition] = useTransition();
  const isActive = item.is_active;

  function handleConfirm() {
    startTransition(async () => {
      try {
        if (isActive) {
          await deactivateItem(item.id);
          toast.success('Item deactivated');
        } else {
          await reactivateItem(item.id);
          toast.success('Item reactivated');
        }
        onOpenChange(false);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isActive ? `Deactivate "${item.name}"?` : `Reactivate "${item.name}"?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isActive
              ? 'It will be hidden from the inventory list but kept for historical reports. You can reactivate it later.'
              : 'It will appear in the inventory list again and can be sold.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Working…' : (isActive ? 'Deactivate' : 'Reactivate')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}