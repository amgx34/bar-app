'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  MoreHorizontal, Plus, Send, History, Pencil, Trash2,
  Mail, Phone, Building2, Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { canManageReps, type Role } from '@/lib/permissions';
import { deleteRep } from '../actions';
import { RepFormDialog } from './rep-form-dialog';
import { OrderDialog } from './order-dialog';
import { OrderHistorySheet } from './order-history-sheet';
import type { Rep } from '../actions';

interface Props {
  reps:           Rep[];
  role:           Role;
  defaultOrderId?: string | null;  // from ?order= URL param
}

export function RepsTable({ reps: initialReps, role, defaultOrderId }: Props) {
  const router = useRouter();
  const [reps, setReps]           = useState(initialReps);
  const [formOpen, setFormOpen]   = useState(false);
  const [editRep, setEditRep]     = useState<Rep | null>(null);
  const [orderRep, setOrderRep]   = useState<Rep | null>(
    defaultOrderId ? (initialReps.find(r => r.id === defaultOrderId) ?? null) : null
  );
  const [historyRep, setHistoryRep] = useState<Rep | null>(null);

  const canEdit = canManageReps(role);

  async function handleDelete(rep: Rep) {
    if (!confirm(`Remove ${rep.name}? This will unlink all associated inventory items.`)) return;
    try {
      await deleteRep(rep.id);
      setReps(prev => prev.filter(r => r.id !== rep.id));
      toast.success(`${rep.name} removed`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove rep');
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {reps.length} rep{reps.length !== 1 ? 's' : ''}
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => { setEditRep(null); setFormOpen(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add rep
          </Button>
        )}
      </div>

      {reps.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 rounded-xl border border-dashed text-center">
          <Building2 className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-muted-foreground">No reps yet</p>
          <p className="text-sm text-muted-foreground">Add your first sales rep or supplier</p>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => { setEditRep(null); setFormOpen(true); }} className="mt-2 gap-1.5">
              <Plus className="h-4 w-4" /> Add First Rep
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-5">Name</TableHead>
                {/* Company gets its own column only once there is room for one.
                    Below `sm` it rides under the name instead — as its own
                    column it forced 208px of nowrap text and pushed the table
                    to 557px inside a 341px card, so a phone had to swipe
                    sideways to reach the Order button. */}
                <TableHead className="hidden sm:table-cell">Company</TableHead>
                <TableHead className="hidden sm:table-cell">Contact</TableHead>
                <TableHead className="hidden md:table-cell">Note</TableHead>
                <TableHead className="text-center w-14 sm:w-20">Products</TableHead>
                <TableHead className="pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reps.map((rep) => (
                <TableRow key={rep.id}>
                  <TableCell className="pl-5 whitespace-normal">
                    <p className="font-medium">{rep.name}</p>
                    <p className="text-xs text-muted-foreground sm:hidden">
                      {rep.company ?? '—'}
                    </p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                    {rep.company ?? '—'}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="space-y-0.5">
                      {rep.email && (
                        <a href={`mailto:${rep.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <Mail className="h-3 w-3" /> {rep.email}
                        </a>
                      )}
                      {rep.phone && (
                        <a href={`tel:${rep.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <Phone className="h-3 w-3" /> {rep.phone}
                        </a>
                      )}
                      {!rep.email && !rep.phone && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell max-w-[200px]">
                    <p className="text-xs text-muted-foreground truncate">{rep.notes ?? '—'}</p>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={rep.product_count > 0 ? 'secondary' : 'outline'} className="tabular-nums">
                      <Package className="h-3 w-3 mr-1" />
                      {rep.product_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm" variant="outline"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => setOrderRep(rep)}
                      >
                        <Send className="h-3.5 w-3.5" /> Order
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`More actions for ${rep.name}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setHistoryRep(rep)}>
                            <History className="h-4 w-4 mr-2" /> Order history
                          </DropdownMenuItem>
                          {canEdit && (
                            <>
                              <DropdownMenuItem onClick={() => { setEditRep(rep); setFormOpen(true); }}>
                                <Pencil className="h-4 w-4 mr-2" /> Edit rep
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDelete(rep)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Remove
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RepFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        rep={editRep}
        onSaved={() => router.refresh()}
      />

      {orderRep && (
        <OrderDialog
          open={!!orderRep}
          onOpenChange={(v) => !v && setOrderRep(null)}
          rep={orderRep}
          onSent={() => router.refresh()}
        />
      )}

      {historyRep && (
        <OrderHistorySheet
          open={!!historyRep}
          onOpenChange={(v) => !v && setHistoryRep(null)}
          rep={historyRep}
        />
      )}
    </>
  );
}
