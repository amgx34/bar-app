'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { createOrgWithSettings, type SetupInput } from './actions';

const BAR_TYPES = [
  { value: 'bar',         label: 'Bar / Tavern' },
  { value: 'nightclub',   label: 'Nightclub' },
  { value: 'restaurant',  label: 'Restaurant + Bar' },
  { value: 'brewery',     label: 'Brewery / Tap Room' },
  { value: 'hotel_bar',   label: 'Hotel Bar' },
  { value: 'sports_bar',  label: 'Sports Bar' },
  { value: 'other',       label: 'Other' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
  'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
  'TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

export default function SetupPage() {
  const router   = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm]       = useState<SetupInput>({
    name:               '',
    bar_type:           'bar',
    bar_state:          '',
    bar_city:           '',
    tip_split_percent:  15,
    barback_tip_pct:    15,
    default_hourly_rate: 15,
    hourly_rates: {
      bartender: 15,
      barback:   13,
      manager:   18,
      server:    13,
      security:  14,
      other:     13,
    },
    default_pour_oz: 1.5,
  });

  const set = <K extends keyof SetupInput>(k: K, v: SetupInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Enter your bar name'); return; }
    setLoading(true);
    try {
      await createOrgWithSettings(form);
      router.push('/setup/pos');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Setup failed');
      setLoading(false);
    }
  }

  const inputCls = 'bg-white/10 border-white/20 text-white placeholder:text-white/25 focus-visible:ring-primary/50';
  const labelCls = 'text-white/60 text-xs';
  const sectionCls = 'rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 space-y-4';

  return (
    <main className="relative min-h-dvh flex items-center justify-center p-6 overflow-hidden bg-gray-950">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-950 to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(20,184,166,0.07),transparent_60%)]" />

      <div className="relative z-10 w-full max-w-2xl pb-8">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-white font-black text-3xl tracking-[0.25em] uppercase mb-3">Rail</p>
          <div className="flex items-center justify-center gap-1.5 mb-4">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <div className="h-px w-8 bg-white/20" />
            <div className="h-2 w-2 rounded-full bg-white/20" />
          </div>
          <h1 className="text-2xl font-bold text-white">Set up your bar</h1>
          <p className="text-white/40 text-sm mt-1">Step 1 of 2 · Takes about a minute</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Your Bar ─────────────────────────────────────────────── */}
          <div className={sectionCls}>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">Your Bar</span>
            </div>

            <div className="space-y-1.5">
              <Label className={labelCls}>Bar / Venue Name *</Label>
              <Input
                autoFocus required placeholder="The Tipsy Tavern"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className={cn(inputCls, 'text-lg h-11')}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={labelCls}>Type</Label>
                <Select value={form.bar_type ?? 'bar'} onValueChange={(v) => set('bar_type', v ?? 'bar')}>
                  <SelectTrigger className={cn(inputCls, 'h-9')}>
                    <span className="text-sm text-white/80">
                      {BAR_TYPES.find(b => b.value === form.bar_type)?.label ?? 'Bar / Tavern'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {BAR_TYPES.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>State</Label>
                <Select value={form.bar_state ?? ''} onValueChange={(v) => set('bar_state', v ?? '')}>
                  <SelectTrigger className={cn(inputCls, 'h-9')}>
                    <span className="text-sm text-white/80">{form.bar_state || <span className="text-white/30">Select state</span>}</span>
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className={labelCls}>City</Label>
              <Input placeholder="Chicago" value={form.bar_city ?? ''}
                onChange={(e) => set('bar_city', e.target.value)}
                className={cn(inputCls, 'h-9')} />
            </div>
          </div>

          {/* ── Tip Configuration ────────────────────────────────────── */}
          <div className={sectionCls}>
            <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">Tip Configuration</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={labelCls}>Tip Pool Split %</Label>
                <div className="relative">
                  <Input type="number" min={0} max={100}
                    value={form.tip_split_percent}
                    onChange={(e) => set('tip_split_percent', Number(e.target.value))}
                    className={cn(inputCls, 'h-9 pr-7')} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 text-xs">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Barback Pool Allocation</Label>
                <div className="relative">
                  <Input type="number" min={0} max={50}
                    value={form.barback_tip_pct ?? 15}
                    onChange={(e) => set('barback_tip_pct', Number(e.target.value))}
                    className={cn(inputCls, 'h-9 pr-7')} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 text-xs">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Staff Rates ──────────────────────────────────────────── */}
          <div className={sectionCls}>
            <div>
              <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">Default Hourly Rates</span>
              <p className="text-white/30 text-xs mt-0.5">Per role — used as defaults when adding employees</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(Object.entries(form.hourly_rates ?? {}) as [string, number][]).map(([role, rate]) => (
                <div key={role} className="space-y-1.5">
                  <Label className={cn(labelCls, 'capitalize')}>{role}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 text-xs">$</span>
                    <Input type="number" min={0} step="0.25"
                      value={rate}
                      onChange={(e) => set('hourly_rates', { ...form.hourly_rates, [role]: Number(e.target.value) })}
                      className={cn(inputCls, 'h-9 pl-6')} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Inventory ────────────────────────────────────────────── */}
          <div className={sectionCls}>
            <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">Inventory Defaults</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={labelCls}>Default Spirit Pour (oz)</Label>
                <Input type="number" min={0.25} step={0.25}
                  value={form.default_pour_oz ?? 1.5}
                  onChange={(e) => set('default_pour_oz', Number(e.target.value))}
                  className={cn(inputCls, 'h-9')} />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Default Hourly Rate (fallback)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 text-xs">$</span>
                  <Input type="number" min={0} step="0.25"
                    value={form.default_hourly_rate}
                    onChange={(e) => set('default_hourly_rate', Number(e.target.value))}
                    className={cn(inputCls, 'h-9 pl-6')} />
                </div>
              </div>
            </div>
          </div>

          <Button
            type="submit" disabled={loading || !form.name.trim()}
            className="w-full h-12 text-base font-semibold bg-white text-gray-900 hover:bg-white/90"
          >
            {loading ? 'Creating your bar…' : 'Continue →'}
          </Button>
        </form>
      </div>
    </main>
  );
}
