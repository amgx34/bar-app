'use client';

import { useState, useRef, useCallback } from 'react';
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

// ── Custom drag slider (no native input quirks on mobile) ────────────────────

function DragSlider({
  value, min, max, step = 1, disabled, onChange, color = '#f59e0b',
}: {
  value: number; min: number; max: number; step?: number;
  disabled?: boolean; onChange: (v: number) => void; color?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = ((value - min) / (max - min)) * 100;

  const resolve = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const { left, width } = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - left) / width));
    const raw   = min + ratio * (max - min);
    onChange(Math.max(min, Math.min(max, Math.round(raw / step) * step)));
  }, [min, max, step, onChange]);

  function onMouseDown(e: React.MouseEvent) {
    if (disabled) return;
    e.preventDefault();
    resolve(e.clientX);
    const move = (ev: MouseEvent) => resolve(ev.clientX);
    const up   = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (disabled) return;
    resolve(e.touches[0].clientX);
    const move = (ev: TouchEvent) => resolve(ev.touches[0].clientX);
    const end  = () => { document.removeEventListener('touchmove', move); document.removeEventListener('touchend', end); };
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', end);
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={disabled ? -1 : 0}
      className={`relative h-8 flex items-center ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   onChange(Math.min(max, value + step));
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') onChange(Math.max(min, value - step));
      }}
    >
      {/* Track fill */}
      <div className="absolute inset-x-0 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-none" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      {/* Thumb — centered exactly on the fill edge */}
      <div
        className="absolute h-5 w-5 rounded-full border-2 border-white shadow-md transition-none z-10"
        style={{ left: `${pct}%`, transform: 'translateX(-50%)', backgroundColor: color }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function TipPayTab({ role, settings }: Props) {
  const [form, setForm] = useState({
    tip_split_percent:  settings.tip_split_percent  ?? 15,
    barback_tip_pct:    settings.barback_tip_pct    ?? 15,
    opener_bonus_type:  (settings.opener_bonus_type  ?? 'none') as 'none' | 'fixed' | 'percentage' | 'hours',
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
  // Says where the money comes from, because the three types are funded
  // differently and that is the part operators get wrong.
  const openerNote = form.opener_bonus_type === 'none'
    ? 'No opener bonus'
    : form.opener_bonus_type === 'fixed'
    ? `$${form.opener_bonus_value.toFixed(2)} per opening shift, taken from the tip pool`
    : form.opener_bonus_type === 'percentage'
    ? `${form.opener_bonus_value}% of the tip pool, taken before it is shared`
    : `${form.opener_bonus_value} extra paid hours at the opener's own rate, paid by the bar`;

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

        {/* Barback slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Barback Share of Tip Pool</Label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={50}
                disabled={!canEdit}
                value={form.barback_tip_pct}
                onChange={(e) => setForm({ ...form, barback_tip_pct: Math.min(50, Math.max(0, Number(e.target.value))) })}
                className="w-14 h-7 rounded-md border border-input bg-background px-2 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>

          <DragSlider
            value={form.barback_tip_pct}
            min={0}
            max={50}
            step={1}
            disabled={!canEdit}
            onChange={(v) => setForm({ ...form, barback_tip_pct: v })}
            color="#f59e0b"
          />

          {/* Visual split bar */}
          <div>
            <div className="h-3 rounded-full overflow-hidden flex">
              <div
                className="bg-primary h-full transition-all duration-150"
                style={{ width: `${bartenderPool}%` }}
              />
              <div
                className="bg-amber-400 h-full transition-all duration-150"
                style={{ width: `${form.barback_tip_pct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs mt-1.5">
              <span className="text-primary font-semibold">Bartenders — {bartenderPool}%</span>
              <span className="text-amber-500 font-semibold">Barbacks — {form.barback_tip_pct}%</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Each night, barbacks collectively receive {form.barback_tip_pct}% of the tip pool split equally by headcount.
            The remaining {bartenderPool}% goes to the bartender pool, distributed by hours worked.
          </p>
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
                <SelectItem value="hours">Extra paid hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.opener_bonus_type !== 'none' && (
            <div className="space-y-1.5">
              <Label>{
                form.opener_bonus_type === 'fixed'      ? 'Bonus Amount ($)'
                : form.opener_bonus_type === 'percentage' ? 'Bonus Percentage (%)'
                : 'Extra Hours'
              }</Label>
              <div className="relative">
                {form.opener_bonus_type === 'fixed' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>}
                <Input type="number" min={0} step={form.opener_bonus_type === 'fixed' ? '0.01' : '1'}
                  disabled={!canEdit}
                  value={form.opener_bonus_value}
                  onChange={(e) => setForm({ ...form, opener_bonus_value: Number(e.target.value) })}
                  className={form.opener_bonus_type === 'fixed' ? 'pl-7' : 'pr-8'} />
                {form.opener_bonus_type === 'percentage' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>}
                {form.opener_bonus_type === 'hours' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">hrs</span>}
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
