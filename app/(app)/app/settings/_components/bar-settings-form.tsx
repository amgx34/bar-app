'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Save, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateBarSettings } from '../actions';
import type { BarSettings } from '@/lib/org';
import type { Role } from '@/lib/permissions';

interface Props {
  orgId: string;
  role: Role;
  current: BarSettings;
}

export function BarSettingsForm({ role, current }: Props) {
  const [form, setForm] = useState(current);
  const [saving, setSaving] = useState(false);
  const canEdit = role === 'owner' || role === 'manager';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateBarSettings(form);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b">
        <h2 className="text-sm font-semibold">Defaults</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Used for payroll calculations and tip splits
        </p>
      </div>
      <form onSubmit={handleSave} className="px-6 py-5 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tip Split %</Label>
            <div className="relative">
              <Input
                type="number"
                min={0}
                max={100}
                disabled={!canEdit}
                value={form.tip_split_percent}
                onChange={(e) => setForm({ ...form, tip_split_percent: Number(e.target.value) })}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Default Hourly Rate</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                disabled={!canEdit}
                value={form.default_hourly_rate}
                onChange={(e) => setForm({ ...form, default_hourly_rate: Number(e.target.value) })}
                className="pl-7"
              />
            </div>
          </div>
        </div>
        {/* Auto-reorder toggle */}
        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              Auto-reorder suggestions
            </div>
            <p className="text-xs text-muted-foreground">
              Show reorder prompts on the dashboard when stock falls below par for items linked to a rep
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer ml-4 shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              disabled={!canEdit}
              checked={form.auto_reorder_enabled ?? false}
              onChange={(e) => setForm({ ...form, auto_reorder_enabled: e.target.checked })}
            />
            <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        {canEdit && (
          <Button type="submit" size="sm" disabled={saving} className="gap-2">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save defaults'}
          </Button>
        )}
      </form>
    </div>
  );
}
