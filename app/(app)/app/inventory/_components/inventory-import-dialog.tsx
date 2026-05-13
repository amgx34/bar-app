'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Sparkles, Check, AlertTriangle, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { parseInventoryForImport, importInventoryItems } from '../actions';
import type { ReviewItem, CommitItem } from '../actions';

const UNITS = ['bottle', 'can', 'keg', 'oz', 'liter', 'case', 'each', 'bag', 'box', 'gallon', 'jar'];

type StockMode = 'set' | 'add';
type ImportState = 'idle' | 'parsing' | 'review' | 'importing' | 'done';

interface EditableItem extends ReviewItem {
  checked: boolean;
}

interface DoneResult {
  created: number;
  updated: number;
  errors: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function InventoryImportDialog({ open, onOpenChange }: Props) {
  const [state, setState] = useState<ImportState>('idle');
  const [text, setText] = useState('');
  const [items, setItems] = useState<EditableItem[]>([]);
  const [stockMode, setStockMode] = useState<StockMode>('add');
  const [result, setResult] = useState<DoneResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setState('idle');
    setText('');
    setItems([]);
    setResult(null);
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText((ev.target?.result as string) ?? '');
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleParse() {
    if (!text.trim()) { toast.error('Paste some inventory data first'); return; }
    setState('parsing');
    try {
      const parsed = await parseInventoryForImport(text);
      if (parsed.length === 0) {
        toast.error('No inventory items found — try rephrasing or check your data');
        setState('idle');
        return;
      }
      setItems(parsed.map((item) => ({ ...item, checked: true })));
      setState('review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Parse failed');
      setState('idle');
    }
  }

  async function handleImport() {
    const selected = items.filter((i) => i.checked);
    if (selected.length === 0) { toast.error('Select at least one item'); return; }
    setState('importing');

    const commit: CommitItem[] = selected.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      cost_price: i.cost_price,
      category: i.category,
      sku: i.sku,
      existingId: i.existingId,
    }));

    try {
      const res = await importInventoryItems(commit, stockMode);
      setResult(res);
      setState('done');
      if (res.errors.length === 0) {
        toast.success(`Imported ${res.created + res.updated} items`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
      setState('review');
    }
  }

  function updateItem(tempId: string, field: keyof EditableItem, value: unknown) {
    setItems((prev) => prev.map((item) => item.tempId === tempId ? { ...item, [field]: value } : item));
  }

  function toggleAll(checked: boolean) {
    setItems((prev) => prev.map((item) => ({ ...item, checked })));
  }

  const checkedCount = items.filter((i) => i.checked).length;
  const allChecked = items.length > 0 && checkedCount === items.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Inventory Import
          </DialogTitle>
          <DialogDescription>
            Paste a supplier invoice, delivery receipt, CSV, or any item list — AI will extract and structure it.
          </DialogDescription>
        </DialogHeader>

        {/* ── Idle: input ───────────────────────────────────────────────────── */}
        {state === 'idle' && (
          <div className="flex flex-col gap-4 px-6 py-5 overflow-y-auto">
            <Textarea
              placeholder={`Paste anything here — examples:\n\n• Supplier invoice text\n• CSV with columns: name, qty, unit, cost\n• "24 bottles Tito's Vodka @ $22.50"\n• Delivery receipt copy-paste`}
              className="min-h-[220px] font-mono text-sm resize-none"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button onClick={handleParse} disabled={!text.trim()} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Parse with AI
              </Button>
              <span className="text-xs text-muted-foreground">or</span>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" />
                Upload file
              </Button>
              <input ref={fileRef} type="file" accept=".txt,.csv,.tsv,text/*" className="hidden" onChange={handleFileChange} />
              <span className="text-xs text-muted-foreground ml-auto">.txt · .csv · .tsv</span>
            </div>
          </div>
        )}

        {/* ── Parsing: skeleton ─────────────────────────────────────────────── */}
        {state === 'parsing' && (
          <div className="flex flex-col gap-3 px-6 py-8">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              AI is reading your data…
            </p>
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {/* ── Review: editable table ────────────────────────────────────────── */}
        {state === 'review' && (
          <>
            {/* Controls bar */}
            <div className="flex items-center gap-4 px-6 py-3 border-b bg-muted/30 shrink-0">
              <span className="text-sm text-muted-foreground">
                {items.length} item{items.length !== 1 ? 's' : ''} found
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-muted-foreground">When importing, stock quantities will:</span>
                <Select value={stockMode} onValueChange={(v) => setStockMode(v as StockMode)}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Add to current stock</SelectItem>
                    <SelectItem value="set">Replace current stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card border-b z-10">
                  <tr>
                    <th className="px-3 py-2.5 text-left w-8">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={(e) => toggleAll(e.target.checked)}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide w-20">Qty</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide w-32">Unit</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide w-24">Cost</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide w-32">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) => (
                    <tr key={item.tempId} className={item.checked ? '' : 'opacity-40'}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={(e) => updateItem(item.tempId, 'checked', e.target.checked)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-2 shrink-0">
                        {item.existingId ? (
                          <Badge variant="secondary" className="text-[10px] font-medium whitespace-nowrap">
                            UPDATE · was {item.existingStock ?? 0}
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                            NEW
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 min-w-[180px]">
                        <input
                          className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-1 py-0.5 text-sm"
                          value={item.name}
                          onChange={(e) => updateItem(item.tempId, 'name', e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="w-16 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-1 py-0.5 text-sm tabular-nums"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.tempId, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-1 py-0.5 text-sm w-full"
                          value={UNITS.includes(item.unit) ? item.unit : 'each'}
                          onChange={(e) => updateItem(item.tempId, 'unit', e.target.value)}
                        >
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                          {item.unit && !UNITS.includes(item.unit) && (
                            <option value={item.unit}>{item.unit}</option>
                          )}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-0.5">
                          <span className="text-muted-foreground text-xs">$</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="—"
                            className="w-16 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-1 py-0.5 text-sm tabular-nums"
                            value={item.cost_price ?? ''}
                            onChange={(e) => updateItem(item.tempId, 'cost_price', e.target.value ? parseFloat(e.target.value) : null)}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-1 py-0.5 text-sm"
                          placeholder="—"
                          value={item.category ?? ''}
                          onChange={(e) => updateItem(item.tempId, 'category', e.target.value || null)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-6 py-4 border-t shrink-0">
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Start over
              </button>
              <span className="text-xs text-muted-foreground ml-2">
                {checkedCount} of {items.length} selected
              </span>
              <Button onClick={handleImport} disabled={checkedCount === 0} className="ml-auto gap-2">
                <Check className="h-4 w-4" />
                Import {checkedCount > 0 ? checkedCount : ''} item{checkedCount !== 1 ? 's' : ''}
              </Button>
            </div>
          </>
        )}

        {/* ── Importing: progress ───────────────────────────────────────────── */}
        {state === 'importing' && (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <Sparkles className="h-8 w-8 text-primary animate-pulse" />
            <p className="text-sm text-muted-foreground">Saving to inventory…</p>
          </div>
        )}

        {/* ── Done: summary ─────────────────────────────────────────────────── */}
        {state === 'done' && result && (
          <div className="flex flex-col gap-5 px-6 py-8">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Check className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold">Import complete</p>
                <p className="text-sm text-muted-foreground">
                  {result.created} created · {result.updated} updated
                  {result.errors.length > 0 ? ` · ${result.errors.length} failed` : ''}
                </p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 space-y-1">
                <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Errors
                </p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-300">{e}</p>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={reset} variant="outline" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Import more
              </Button>
              <Button onClick={() => handleClose(false)} className="gap-2">
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
