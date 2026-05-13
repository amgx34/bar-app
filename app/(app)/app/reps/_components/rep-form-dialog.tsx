'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { repSchema, type RepInput } from '@/lib/schemas/reps';
import { createRep, updateRep } from '../actions';
import type { Rep } from '../actions';

interface Props {
  open:          boolean;
  onOpenChange:  (v: boolean) => void;
  rep?:          Rep | null;
  onSaved:       () => void;
}

export function RepFormDialog({ open, onOpenChange, rep, onSaved }: Props) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<RepInput>({
    resolver: zodResolver(repSchema),
    defaultValues: { name: '', company: '', phone: '', email: '', notes: '' },
  });

  useEffect(() => {
    if (open) {
      reset(rep
        ? { name: rep.name, company: rep.company ?? '', phone: rep.phone ?? '', email: rep.email ?? '', notes: rep.notes ?? '' }
        : { name: '', company: '', phone: '', email: '', notes: '' }
      );
    }
  }, [open, rep, reset]);

  async function onSubmit(values: RepInput) {
    try {
      if (rep) await updateRep(rep.id, values);
      else     await createRep(values);
      toast.success(rep ? 'Rep updated' : 'Rep added');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{rep ? `Edit ${rep.name}` : 'Add rep / supplier'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input {...register('name')} placeholder="John Smith" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Company</Label>
            <Input {...register('company')} placeholder="Sysco, Southern Wine & Spirits…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input {...register('phone')} placeholder="+15555550100" />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input {...register('email')} type="email" placeholder="rep@supplier.com" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea {...register('notes')} rows={3} placeholder="Account number, delivery days, etc." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : rep ? 'Save changes' : 'Add rep'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
