'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Save, Info, SlidersHorizontal } from 'lucide-react';
import { describeOvertime, overtimePay } from '@/lib/payroll/overtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { updateTipPaySettings } from '../actions';
import {
  BarbackSettingsDialog,
  describeBarbackConfig,
  type BarbackConfig,
} from './barback-settings-dialog';
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
    // Absent means enabled: every pay run before this setting existed paid
    // time-and-a-half, and opening this screen must not change that.
    // Defaults to 'hours', matching the bartender pool.
    barback_split_method: (settings.barback_split_method ?? 'hours') as 'hours' | 'equal',
    // Absent means off, so a bar that has never opened the dialog keeps being
    // paid by the flat slider exactly as it was.
    barback_tiers_enabled: settings.barback_tiers_enabled ?? false,
    barback_tip_tiers: settings.barback_tip_tiers ?? [],
    overtime_enabled:    settings.overtime_enabled !== false,
    overtime_multiplier: settings.overtime_multiplier ?? 1.5,
  });
  const [saving, setSaving] = useState(false);
  const [barbackOpen, setBarbackOpen] = useState(false);
  // What the barback settings were when the dialog opened, so Cancel can put
  // them back — the dialog edits this form live, which is what lets the summary
  // line update as you drag, but it also means backing out has to be a real
  // undo rather than just a close.
  const [barbackSnapshot, setBarbackSnapshot] = useState<BarbackConfig | null>(null);
  const canEdit = role === 'owner' || role === 'manager';

  const barbackConfig: BarbackConfig = {
    barback_tip_pct: form.barback_tip_pct,
    barback_split_method: form.barback_split_method,
    barback_tiers_enabled: form.barback_tiers_enabled,
    barback_tip_tiers: form.barback_tip_tiers,
  };

  async function save() {
    setSaving(true);
    try {
      await updateTipPaySettings(form);
      toast.success('Tip & pay settings saved');
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await save();
  }

  function openBarback() {
    setBarbackSnapshot(barbackConfig);
    setBarbackOpen(true);
  }

  function closeBarback(open: boolean) {
    // Closing by any route — Cancel, Escape, the backdrop — discards. Saving
    // clears the snapshot first, so it survives the close that follows.
    if (!open && barbackSnapshot) setForm((prev) => ({ ...prev, ...barbackSnapshot }));
    setBarbackOpen(open);
  }

  async function saveBarback() {
    if (await save()) {
      setBarbackSnapshot(null);
      setBarbackOpen(false);
    }
  }

  function setRate(k: keyof HourlyRates, v: number) {
    setForm(prev => ({ ...prev, hourly_rates: { ...prev.hourly_rates, [k]: v } }));
  }

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

        {/* One row, not four controls. The detail lives in a dialog because
            the cut, the tiers and the division rule are one arrangement, and
            spread out they crowded every other pay setting off the screen. */}
        <div className="flex items-center justify-between gap-4 rounded-lg border bg-background p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Barback Tip Share</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {describeBarbackConfig(barbackConfig)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={openBarback}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {canEdit ? 'Configure' : 'View'}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Bartenders take whatever the barbacks do not, distributed by hours worked.
        </p>
      </div>

      <BarbackSettingsDialog
        open={barbackOpen}
        onOpenChange={closeBarback}
        canEdit={canEdit}
        saving={saving}
        value={barbackConfig}
        onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
        onSave={saveBarback}
      />

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

      {/* Overtime */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Overtime</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Hours past 40 in a week count as overtime. A long shift on its own does
            not &mdash; a close that runs past midnight is an ordinary bar shift.
          </p>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="ot-enabled" className="text-sm">Pay an overtime premium</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Turning this off does not stop overtime being paid &mdash; those hours were
              worked and are still owed. They are paid at the base rate instead of a
              premium.
            </p>
          </div>
          <button
            id="ot-enabled"
            type="button"
            role="switch"
            aria-checked={form.overtime_enabled}
            aria-label="Pay an overtime premium"
            disabled={!canEdit}
            onClick={() => canEdit && setForm({ ...form, overtime_enabled: !form.overtime_enabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
              form.overtime_enabled ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              form.overtime_enabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {form.overtime_enabled && (
          <div className="space-y-1.5">
            <Label htmlFor="ot-multiplier" className="text-sm">Multiplier</Label>
            <Input
              id="ot-multiplier" type="number" min={1} max={5} step="0.25"
              disabled={!canEdit}
              value={form.overtime_multiplier}
              onChange={(e) =>
                setForm({ ...form, overtime_multiplier: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })
              }
              className="max-w-32"
            />
            <p className="text-xs text-muted-foreground">
              1.5 is federal time-and-a-half. Cannot go below 1 &mdash; overtime is never
              worth less than a normal hour.
            </p>
          </div>
        )}

        <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          {describeOvertime({ enabled: form.overtime_enabled, multiplier: form.overtime_multiplier })}
          {' '}An employee on $20/hr working 10 overtime hours earns{' '}
          <span className="font-medium text-foreground">
            ${overtimePay(10, 20, { enabled: form.overtime_enabled, multiplier: form.overtime_multiplier }).toFixed(2)}
          </span>{' '}
          for them.
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
