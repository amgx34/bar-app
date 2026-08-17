'use client';

import { useEffect, useState } from 'react';
import { History, Mail, MessageSquare, Package } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getRepOrders } from '../actions';
import type { Rep, RepOrder } from '../actions';

interface Props {
  open:         boolean;
  onOpenChange: (v: boolean) => void;
  rep:          Rep;
}

const STATUS_COLORS: Record<string, string> = {
  sent:      'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  confirmed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  delivered: 'bg-primary/15 text-primary border-primary/30',
  cancelled: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  draft:     'bg-muted text-muted-foreground',
};

export function OrderHistorySheet({ open, onOpenChange, rep }: Props) {
  const [orders, setOrders] = useState<RepOrder[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getRepOrders(rep.id)
      .then(setOrders)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, rep.id]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            Order history — {rep.name}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {loading ? (
            [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Package className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No orders yet for this rep</p>
            </div>
          ) : (
            orders.map((order) => {
              const items = (order.items as { name: string; quantity: number; unit: string; note?: string }[]);
              return (
                <div key={order.id} className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{order.po_number || `Order ${order.id.slice(0, 8)}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {order.delivery_date && ` · Deliver ${new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className={STATUS_COLORS[order.status] ?? ''}>
                        {order.status}
                      </Badge>
                      {order.send_email && <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
                      {order.send_sms   && <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                  </div>

                  <ul className="space-y-1">
                    {items.slice(0, 4).map((item, i) => (
                      <li key={i} className="flex justify-between text-xs text-muted-foreground">
                        <span className="truncate">{item.name}</span>
                        <span className="tabular-nums shrink-0 ml-2">{item.quantity} {item.unit}</span>
                      </li>
                    ))}
                    {items.length > 4 && (
                      <li className="text-xs text-muted-foreground">+{items.length - 4} more</li>
                    )}
                  </ul>

                  {order.notes && (
                    <p className="text-xs text-muted-foreground border-t pt-2 italic">{order.notes}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
