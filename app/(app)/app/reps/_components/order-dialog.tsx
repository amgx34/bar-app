'use client';

import { useEffect, useState } from 'react';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, Package, Send } from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { orderSchema, type OrderInput } from '@/lib/schemas/reps';
import { sendRepOrder, getRepInventoryItems } from '../actions';
import type { Rep, RepInventoryItem } from '../actions';

interface Props {
  open:         boolean;
  onOpenChange: (v: boolean) => void;
  rep:          Rep;
  prefillItems?: { name: string; unit: string; quantity: number }[];
  onSent:       () => void;
}

export function OrderDialog({ open, onOpenChange, rep, prefillItems, onSent }: Props) {
  const [repItems, setRepItems]   = useState<RepInventoryItem[]>([]);
  const [loadingItems, setLoading] = useState(false);

  const { register, control, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<OrderInput>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      po_number:     '',
      delivery_date: '',
      notes:         '',
      send_email:    !!rep.email,
      send_sms:      false,
      items:         [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const sendEmail = watch('send_email');
  const sendSms   = watch('send_sms');

  // Load rep's inventory items when dialog opens
  useEffect(() => {
    if (!open) return;
    reset({
      po_number: '', delivery_date: '', notes: '',
      send_email: !!rep.email, send_sms: false, items: [],
    });

    setLoading(true);
    getRepInventoryItems(rep.id)
      .then((items) => {
        setRepItems(items);
        if (prefillItems && prefillItems.length > 0) {
          prefillItems.forEach((pi) => append({ name: pi.name, quantity: pi.quantity, unit: pi.unit, note: '' }));
        } else if (items.length > 0) {
          // Pre-populate with all of the rep's items at qty 0 so user can fill in what they need
          items.forEach((i) => append({ inventory_item_id: i.id, name: i.name, quantity: 1, unit: i.unit, note: '' }));
        } else {
          append({ name: '', quantity: 1, unit: 'each', note: '' });
        }
      })
      .catch(() => {
        append({ name: '', quantity: 1, unit: 'each', note: '' });
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rep.id]);

  async function onSubmit(values: OrderInput) {
    try {
      const result = await sendRepOrder(rep.id, values);
      if (result.emailWarning) {
        // Order saved — email just didn't send
        toast.success(`Order recorded for ${rep.name}`);
        toast.warning(`Email not sent: ${result.emailWarning}. Check GMAIL_APP_PASSWORD in settings.`, { duration: 8000 });
      } else {
        toast.success(`Order sent to ${rep.name}`);
      }
      onSent();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send order');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            New Order — {rep.name}
          </DialogTitle>
          <DialogDescription>{rep.company ?? ''}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">

            {/* Items ──────────────────────────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Order Items</Label>
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => append({ name: '', quantity: 1, unit: 'each', note: '' })}
                  className="h-7 text-xs gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add item
                </Button>
              </div>

              {loadingItems ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : fields.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center border border-dashed rounded-lg">
                  <Package className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No items — click "Add item" above</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_80px_90px_1fr_32px] gap-2 px-1">
                    {['Item name','Qty','Unit','Note',''].map((h,i) => (
                      <span key={i} className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{h}</span>
                    ))}
                  </div>
                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-[1fr_80px_90px_1fr_32px] gap-2 items-start">
                      <div>
                        <Input
                          {...register(`items.${index}.name`)}
                          placeholder="Item name"
                          className="h-8 text-sm"
                        />
                        {errors.items?.[index]?.name && (
                          <p className="text-[10px] text-destructive mt-0.5">{errors.items[index]?.name?.message}</p>
                        )}
                      </div>
                      <Input
                        {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                        type="number" min="0" step="0.01"
                        className="h-8 text-sm tabular-nums"
                      />
                      <Input
                        {...register(`items.${index}.unit`)}
                        placeholder="each"
                        className="h-8 text-sm"
                      />
                      <Input
                        {...register(`items.${index}.note`)}
                        placeholder="Optional note"
                        className="h-8 text-sm"
                      />
                      <Button
                        type="button" size="icon" variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {errors.items && typeof errors.items.message === 'string' && (
                <p className="text-xs text-destructive">{errors.items.message}</p>
              )}
            </div>

            {/* Order details ──────────────────────────────────────────────── */}
            <div className="space-y-3 border-t pt-4">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Order Details</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">PO Number</Label>
                  <Input {...register('po_number')} placeholder="Auto-generated if blank" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Requested Delivery Date</Label>
                  <input type="date" {...register('delivery_date')}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes to rep</Label>
                <Textarea {...register('notes')} rows={2} placeholder="Special instructions, delivery window, etc." />
              </div>
            </div>

            {/* Send method ────────────────────────────────────────────────── */}
            <div className="space-y-3 border-t pt-4">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Send via</Label>
              <div className="flex flex-wrap gap-3">
                <Controller name="send_email" control={control} render={({ field }) => (
                  <label className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 cursor-pointer transition-colors ${field.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'} ${!rep.email ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <input type="checkbox" checked={field.value} onChange={field.onChange} disabled={!rep.email} className="rounded" />
                    <span className="text-sm font-medium">Email</span>
                    {rep.email
                      ? <span className="text-xs text-muted-foreground">{rep.email}</span>
                      : <span className="text-xs text-muted-foreground">(no email on file)</span>}
                  </label>
                )} />
                <Controller name="send_sms" control={control} render={({ field }) => (
                  <label className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 cursor-pointer transition-colors ${field.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'} ${!rep.phone ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <input type="checkbox" checked={field.value} onChange={field.onChange} disabled={!rep.phone} className="rounded" />
                    <span className="text-sm font-medium">SMS</span>
                    {rep.phone
                      ? <span className="text-xs text-muted-foreground">{rep.phone}</span>
                      : <span className="text-xs text-muted-foreground">(no phone on file)</span>}
                  </label>
                )} />
              </div>
              {errors.send_email && <p className="text-xs text-destructive">{errors.send_email.message}</p>}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isSubmitting ? 'Saving…' : (!sendEmail && !sendSms ? 'Record Order' : 'Send Order')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
