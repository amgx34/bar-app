'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Save, RefreshCw, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateInventoryDefaults } from '../actions';
import type { BarSettings } from '@/lib/org';
import type { Role } from '@/lib/permissions';

const ALL_BOTTLE_SIZES = [
  { ml: 50,   label: '50 ml — Mini' },
  { ml: 200,  label: '200 ml — Half pint' },
  { ml: 375,  label: '375 ml — Pint' },
  { ml: 750,  label: '750 ml — Fifth' },
  { ml: 1000, label: '1 L — Liter' },
  { ml: 1140, label: '1.14 L — Quart' },
  { ml: 1750, label: '1.75 L — Handle' },
];

const DEFAULT_SIZES = [375, 750, 1000, 1750];
const ML_TO_OZ = 0.033814;

interface Props {
  role:     Role;
  settings: BarSettings;
}

export function InventoryTab({ role, settings }: Props) {
  const [pourOz,    setPourOz]    = useState(settings.default_pour_oz    ?? 1.5);
  const [sizes,     setSizes]     = useState<number[]>(settings.bottle_sizes_ml ?? DEFAULT_SIZES);
  const [autoOrder, setAutoOrder] = useState(settings.auto_reorder_enabled ?? false);
  const [saving, setSaving] = useState(false);
  const canEdit = role === 'owner' || role === 'manager';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateInventoryDefaults({ default_pour_oz: pourOz, bottle_sizes_ml: sizes, auto_reorder_enabled: autoOrder });
      toast.success('Inventory defaults saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function toggleSize(ml: number) {
    setSizes(prev => prev.includes(ml) ? prev.filter(s => s !== ml) : [...prev, ml].sort((a, b) => a - b));
  }

  // Live preview for 750ml bottle
  const previewServings = pourOz > 0 ? (750 * ML_TO_OZ) / pourOz : 0;
  const previewCost     = 30 / previewServings;  // example $30 bottle

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Pour defaults */}
      <div className="rounded-xl border bg-card p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Spirit Pour Defaults</h3>
          <p className="text-xs text-muted-foreground mt-1">Used to auto-calculate servings and cost-per-pour on liquor items</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Default Pour Size</Label>
            <div className="relative">
              <Input type="number" min={0.25} max={6} step={0.25} disabled={!canEdit}
                value={pourOz}
                onChange={(e) => setPourOz(Number(e.target.value))} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">oz</span>
            </div>
            <p className="text-xs text-muted-foreground">Typical: 1 oz (shot), 1.5 oz (standard), 2 oz (double)</p>
          </div>

          {/* Live calculation preview */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-2">
            <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <Calculator className="h-3.5 w-3.5" /> Preview — 750 ml bottle @ {pourOz} oz pour
            </p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Bottle volume</span>
                <span className="tabular-nums">{(750 * ML_TO_OZ).toFixed(1)} oz</span>
              </div>
              <div className="flex justify-between">
                <span>Servings per bottle</span>
                <span className="tabular-nums font-semibold text-foreground">{previewServings.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cost per pour (ex. $30 bottle)</span>
                <span className="tabular-nums font-semibold text-foreground">${previewCost.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottle sizes */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Available Bottle Sizes</h3>
          <p className="text-xs text-muted-foreground mt-1">Choose which sizes appear in the inventory item form</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {ALL_BOTTLE_SIZES.map(({ ml, label }) => (
            <label key={ml} className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 cursor-pointer transition-colors ${
              sizes.includes(ml) ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/20'
            } ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}>
              <input type="checkbox" checked={sizes.includes(ml)} onChange={() => canEdit && toggleSize(ml)} className="rounded" />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Auto-reorder */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              Auto-reorder suggestions
            </div>
            <p className="text-xs text-muted-foreground">
              Show reorder prompts on the dashboard when stock falls below par for items with a linked rep
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer ml-4 shrink-0">
            <input type="checkbox" className="sr-only peer" disabled={!canEdit}
              checked={autoOrder} onChange={(e) => setAutoOrder(e.target.checked)} />
            <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>
      </div>

      {canEdit && (
        <Button type="submit" disabled={saving} className="gap-2">
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Save inventory settings'}
        </Button>
      )}
    </form>
  );
}
