'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface WellConfig {
  id: number;
  name: string;
  weight: number;
}

export interface WellSettings {
  count: number;
  wells: WellConfig[];
}

export const DEFAULT_WELL_COUNT = 7;

export function buildDefaultWells(count: number): WellConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Well ${i + 1}`,
    weight: 1,
  }));
}

interface WellSettingsDialogProps {
  settings: WellSettings;
  onSave: (settings: WellSettings) => void;
  onClose: () => void;
}

export default function WellSettingsDialog({
  settings,
  onSave,
  onClose,
}: WellSettingsDialogProps) {
  const [count, setCount] = useState(settings.count);
  const [wells, setWells] = useState<WellConfig[]>(() => {
    // Expand or trim wells to match the initial count
    const base = [...settings.wells];
    while (base.length < settings.count) {
      base.push({ id: base.length + 1, name: `Well ${base.length + 1}`, weight: 1 });
    }
    return base.slice(0, settings.count);
  });

  const handleCountChange = (next: number) => {
    const clamped = Math.max(1, Math.min(12, next));
    setCount(clamped);
    setWells((prev) => {
      if (clamped > prev.length) {
        return [
          ...prev,
          ...Array.from({ length: clamped - prev.length }, (_, i) => ({
            id: prev.length + i + 1,
            name: `Well ${prev.length + i + 1}`,
            weight: 1,
          })),
        ];
      }
      return prev.slice(0, clamped);
    });
  };

  const updateWell = (id: number, field: 'name' | 'weight', value: string | number) => {
    setWells((prev) =>
      prev.map((w) => (w.id === id ? { ...w, [field]: value } : w))
    );
  };

  const handleSave = () => {
    onSave({ count, wells: wells.slice(0, count) });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Well Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Well count */}
          <div className="space-y-2">
            <Label>Number of Wells</Label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCountChange(count - 1)}
                className="flex h-8 w-8 items-center justify-center rounded-md border text-lg font-medium hover:bg-muted"
              >
                −
              </button>
              <span className="w-8 text-center font-medium tabular-nums">{count}</span>
              <button
                onClick={() => handleCountChange(count + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-md border text-lg font-medium hover:bg-muted"
              >
                +
              </button>
              <span className="text-xs text-muted-foreground ml-1">(max 12)</span>
            </div>
          </div>

          {/* Per-well config */}
          <div className="space-y-3">
            <Label>Well Names &amp; Weights</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Weight controls each well's share of expected sales. Equal weights = equal share.
            </p>
            {wells.slice(0, count).map((w) => (
              <div key={w.id} className="flex items-center gap-2">
                <Input
                  value={w.name}
                  onChange={(e) => updateWell(w.id, 'name', e.target.value)}
                  className="flex-1 h-8 text-sm"
                  placeholder={`Well ${w.id}`}
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground">Weight</span>
                  <Input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={w.weight}
                    onChange={(e) => updateWell(w.id, 'weight', parseFloat(e.target.value) || 1)}
                    className="w-16 h-8 text-sm text-center"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
