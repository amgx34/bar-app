'use client';

import { useOptimistic, useState } from 'react';
import { MoreHorizontal, Package, AlertTriangle } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  canEditInventory,
  canDeleteInventory,
  canAdjustStock,
  type Role,
} from '@/lib/permissions';
import { ItemFormDialog } from './item-form-dialog';
import { StockAdjustDialog } from './stock-adjust-dialog';
import { DeactivateDialog } from './deactivate-dialog';

export type ItemRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  par_level: number | null;
  cost_price: number | null;
  sale_price: number | null;
  current_stock: number;
  is_active: boolean;
  category_id: string | null;
  rep_id: string | null;
  bottle_size_ml: number | null;
  pour_size_oz: number | null;
  inventory_categories: { id: string; name: string } | null;
  reps: { id: string; name: string } | null;
};

type Props = {
  items:          ItemRow[];
  categories:     { id: string; name: string }[];
  reps:           { id: string; name: string }[];
  role:           Role;
  defaultPourOz?: number;
  bottleSizesMl?: number[];
};

function formatMoney(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
  }).format(n);
}

export function InventoryTable({ items, categories, reps, role, defaultPourOz, bottleSizesMl }: Props) {
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [adjusting, setAdjusting] = useState<ItemRow | null>(null);
  const [deactivating, setDeactivating] = useState<ItemRow | null>(null);

  /**
   * Stock counting is done in bursts — someone works down a shelf adjusting one
   * item after another. Waiting for a server round trip and a revalidation
   * before each number moves makes that feel broken, so the new figure is shown
   * immediately and reconciled when the server responds.
   *
   * React discards the optimistic value automatically once the transition
   * settles, so a failed action reverts the row without any rollback code here.
   */
  const [optimisticItems, applyOptimisticStock] = useOptimistic(
    items,
    (current: ItemRow[], adjustment: { id: string; newStock: number }) =>
      current.map((row) =>
        row.id === adjustment.id ? { ...row, current_stock: adjustment.newStock } : row,
      ),
  );

  if (optimisticItems.length === 0) {
    return (
      <div className="border rounded-lg p-12 text-center space-y-2">
        <Package className="h-8 w-8 mx-auto text-muted-foreground" />
        <h3 className="font-medium">No items yet</h3>
        <p className="text-sm text-muted-foreground">
          {canEditInventory(role)
            ? 'Click "Add item" to create your first inventory item.'
            : 'Ask an owner or manager to add items to your inventory.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Par</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {optimisticItems.map((item) => {
              const belowPar =
                item.par_level !== null && item.current_stock < item.par_level;
              return (
                <TableRow key={item.id} className={!item.is_active ? 'opacity-50' : ''}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {item.name}
                      {!item.is_active && (
                        <Badge variant="outline" className="text-xs">Inactive</Badge>
                      )}
                    </div>
                    {item.sku && (
                      <div className="text-xs text-muted-foreground">{item.sku}</div>
                    )}
                    {item.reps && (
                      <div className="text-xs text-muted-foreground/60">{item.reps.name}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.inventory_categories?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm">{item.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div className="flex items-center justify-end gap-1.5">
                      {belowPar && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      )}
                      {item.current_stock}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {item.par_level ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatMoney(item.cost_price)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(item.sale_price)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-9 w-9" aria-label="Actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canAdjustStock(role) && item.is_active && (
                          <DropdownMenuItem onClick={() => setAdjusting(item)}>
                            Adjust stock
                          </DropdownMenuItem>
                        )}
                        {canEditInventory(role) && (
                          <DropdownMenuItem onClick={() => setEditing(item)}>
                            Edit
                          </DropdownMenuItem>
                        )}
                        {canDeleteInventory(role) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeactivating(item)}
                              className="text-destructive focus:text-destructive"
                            >
                              {item.is_active ? 'Deactivate' : 'Reactivate'}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <ItemFormDialog
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          categories={categories}
          reps={reps}
          defaultPourOz={defaultPourOz}
          bottleSizesMl={bottleSizesMl}
          mode="edit"
          item={editing}
        />
      )}
      {adjusting && (
        <StockAdjustDialog
          open={!!adjusting}
          onOpenChange={(open) => !open && setAdjusting(null)}
          item={adjusting}
          onOptimisticStock={applyOptimisticStock}
        />
      )}
      {deactivating && (
        <DeactivateDialog
          open={!!deactivating}
          onOpenChange={(open) => !open && setDeactivating(null)}
          item={deactivating}
        />
      )}
    </>
  );
}