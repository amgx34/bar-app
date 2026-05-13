'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Save, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { updateTipPaySettings } from '../actions';
import type { BarSettings, HourlyRates } from '@/lib/org';
import type { Role } from '@/lib/permissions';

interface Props {
  role:     Role;
  settings: BarSettings;
}

const ROLES: Array<{ key: keyof HourlyRates; label: string; desc: string }> = [
  { key: 'bartender', label: 'Bartender',  desc: 'Front-of-bar, tip pool' },
  { key: 'barback',   label: 'Barback',    desc: 'Support, barback pool' },
  { key: 'manager',   label: 'Manager',    desc: 'Typically not tipped' },
  { key: 'server',    label: 'Server',     desc: 'Table service' },
  { key: 'security',  label: 'Security',   desc: 'Door / floor' },
  { key: 'other',     label: 'Other',      desc: 'Misc hourly staff' },
];

export function TipPayTab({ role, settings }: Props) {
  const [form, setForm] = useState({
    tip_split_percent:  settings.tip_split_percent  ?? 15,
    barback_tip_pct:    settings.barback_tip_pct    ?? 15,
    opener_bonus_type:  (settings.opener_bonus_type  ?? 'none') as 'none' | 'fixed' | 'percentage',
    opener_bonus_value: settings.opener_bonus_value  ?? 0,
    default_hourly_rate: settings.default_hourly_rate ?? 15,
    hourly_rates: {
      bartender: settings.hourly_rates?.bartender ?? settings.default_hourly_rate ?? 15,
      barback:   settings.hourly_rates?.barback   ?? 13,
      manager:   settings.hourly_rates?.manager   ?? 18,
      server:    settings.hourly_rates?.server    ?? 13,
      security:  settings.hourly_rates?.security  ?? 14,
      other:     settings.hourly_rates?.other     ?? 13,
    } as Required<HourlyRates>,
  });
  const [saving, setSaving] = useState(false);
  const canEdit = role === 'owner' || role === 'manager';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateTipPaySettings(form);
      toast.success('Tip & pay settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function setRate(k: keyof HourlyRates, v: number) {
    setForm(prev => ({ ...prev, hourly_rates: { ...prev.hourly_rates, [k]: v } }));
  }

  // Calculated preview
  const bartenderPool = 100 - form.barback_tip_pct;
  const openerNote = form.opener_bonus_type === 'none'
    ? 'No opener bonus'
    : form.opener_bonus_type === 'fixed'
    ? `$${form.opener_bonus_value.toFixed(2)} flat bonus per opening shift`
    : `${form.opener_bonus_value}% of the bartender pool extra`;

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Tip pool */}
      <div className="rounded-xl border bg-card p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Tip Pool Allocation</h3>
          <p className="text-xs text-muted-foreground mt-1">
            How nightly tips are split between bartenders and barbacks
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tip Pool Split %</Label>
            <div className="relative">
              <Input type="number" min={0} max={100} disabled={!canEdit}
                value={form.tip_split_percent}
                onChange={(e) => setForm({ ...form, tip_split_percent: Number(e.target.value) })}
                className="pr-8" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
            <p className="text-xs text-muted-foreground">% of total sales allocated to the tip pool</p>
          </div>
          <div className="space-y-1.5">
            <Label>Barback Pool Share</Label>
            <div className="relative">
              <Input type="number" min={0} max={50} disabled={!canEdit}
                value={form.barback_tip_pct}
                onChange={(e) => setForm({ ...form, barback_tip_pct: Number(e.target.value) })}
                className="pr-8" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
            <p className="text-xs text-muted-foreground">Of the tip pool, barbacks receive this %</p>
          </div>
        </div>

        {/* Visual split */}
        <div className="rounded-lg bg-muted/50 px-4 py-3 flex items-center gap-4 text-sm">
          <div className="flex-1">
            <div className="h-2 rounded-full bg-border overflow-hidden flex">
              <div className="bg-primary h-full rounded-l-full transition-all" style={{ width: `${bartenderPool}%` }} />
              <div className="bg-amber-400 h-full rounded-r-full transition-all" style={{ width: `${form.barback_tip_pct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
              <span className="text-primary font-medium">Bartenders {bartenderPool}%</span>
              <span className="text-amber-500 font-medium">Barbacks {form.barback_tip_pct}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Opener bonus */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Opener Bonus</h3>
          <p className="text-xs text-muted-foreground mt-1">Extra compensation for staff who open the bar</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Bonus Type</Label>
            <Select value={form.opener_bonus_type}
              onValueChange={(v) => setForm({ ...form, opener_bonus_type: v as typeof form.opener_bonus_type })}
              disabled={!canEdit}>
              <SelectTrigger>
                <span className="text-sm capitalize">{form.opener_bonus_type === 'none' ? 'No bonus' : form.opener_bonus_type}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No opener bonus</SelectItem>
                <SelectItem value="fixed">Fixed dollar amount</SelectItem>
                <SelectItem value="percentage">Percentage of bartender pool</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.opener_bonus_type !== 'none' && (
            <div className="space-y-1.5">
              <Label>{form.opener_bonus_type === 'fixed' ? 'Bonus Amount ($)' : 'Bonus Percentage (%)'}</Label>
              <div className="relative">
                {form.opener_bonus_type === 'fixed' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>}
                <Input type="number" min={0} step={form.opener_bonus_type === 'fixed' ? '0.01' : '1'}
                  disabled={!canEdit}
                  value={form.opener_bonus_value}
                  onChange={(e) => setForm({ ...form, opener_bonus_value: Number(e.target.value) })}
                  className={form.opener_bonus_type === 'fixed' ? 'pl-7' : 'pr-8'} />
                {form.opener_bonus_type === 'percentage' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">{openerNote}</p>
        </div>
      </div>

      {/* Hourly rates */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Default Hourly Rates</h3>
          <p className="text-xs text-muted-foreground mt-1">Applied as defaults when creating or importing employees</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map(({ key, label, desc }) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-sm">{label}</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input type="number" min={0} step="0.25" disabled={!canEdit}
                  value={form.hourly_rates[key] ?? ''}
                  onChange={(e) => setRate(key, Number(e.target.value))}
                  className="pl-7" />
              </div>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {canEdit && (
        <Button type="submit" disabled={saving} className="gap-2">
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Save tip & pay settings'}
        </Button>
      )}
    </form>
  );
}
