'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { inferTimezone, TIMEZONES } from '@/lib/setup/create-bar';
import { createOrgWithSettings } from '../actions';

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

const TZ_LABEL: Record<string, string> = {
  'America/New_York': 'Eastern', 'America/Chicago': 'Central', 'America/Denver': 'Mountain',
  'America/Phoenix': 'Arizona (no daylight saving)', 'America/Los_Angeles': 'Pacific',
  'America/Anchorage': 'Alaska', 'Pacific/Honolulu': 'Hawaii',
};

export function SetupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [barType, setBarType] = useState('bar');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [tzChoice, setTzChoice] = useState('');
  const [terms, setTerms] = useState(false);

  // The inferred zone follows the state until the owner picks one themselves.
  const timezone = tzChoice || inferTimezone(state) || '';
  const ready = Boolean(name.trim() && state && timezone && terms);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await createOrgWithSettings({
        name, bar_type: barType, bar_state: state, bar_city: city, timezone, accepted_terms: terms,
      });
      if (r.ok) { router.push(r.existing ? '/app/dashboard' : '/setup/pos'); return; }
      if (r.code === 'signed_out') { router.push('/login?next=/setup'); return; }
      setError(r.message);
    } catch {
      setError('We could not create your bar. Nothing was charged. Try again.');
    }
    setLoading(false);
  }

  const inputCls = 'bg-white/10 border-white/20 text-white placeholder:text-white/55 focus-visible:ring-white/70 data-[size=default]:h-11! h-11';
  const labelCls = 'text-white/80 text-xs';

  return (
    <main className="relative min-h-dvh flex items-center justify-center p-6 overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className="absolute inset-0 bg-gradient-to-br from-sidebar-accent via-sidebar to-sidebar" />
      <div className="relative z-10 w-full max-w-lg pb-8">
        <div className="text-center mb-8">
          <p className="text-white font-black text-3xl tracking-[0.25em] uppercase mb-3">Rail</p>
          <h1 className="text-2xl font-bold text-white">Set up your bar</h1>
          <p className="text-white/80 text-sm mt-1">Tell us about your bar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl border border-white/20 bg-white/5 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="text-white/80 text-xs font-semibold uppercase tracking-widest">Your bar</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bar-name" className={labelCls}>Bar name</Label>
              <Input id="bar-name" autoFocus required placeholder="The Tipsy Tavern" value={name}
                onChange={(e) => setName(e.target.value)} className={cn(inputCls, 'text-lg')} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bar-city" className={labelCls}>City</Label>
                <Input id="bar-city" placeholder="Cincinnati" value={city}
                  onChange={(e) => setCity(e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>State</Label>
                <Select value={state} onValueChange={(v) => setState(v ?? '')}>
                  <SelectTrigger aria-label="State" className={cn(inputCls, 'w-full')}>
                    <span className="text-sm text-white/80">{state || <span className="text-white/60">Select</span>}</span>
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className={labelCls}>Time zone, used for your nightly close</Label>
              <Select value={timezone} onValueChange={(v) => setTzChoice(v ?? '')}>
                <SelectTrigger aria-label="Time zone" className={cn(inputCls, 'w-full')}>
                  <span className="text-sm text-white/80">
                    {timezone ? TZ_LABEL[timezone] ?? timezone : <span className="text-white/60">Choose your time zone</span>}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((t) => <SelectItem key={t} value={t}>{TZ_LABEL[t] ?? t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className={labelCls}>Bar type</Label>
              <Select value={barType} onValueChange={(v) => setBarType(v ?? 'bar')}>
                <SelectTrigger aria-label="Bar type" className={cn(inputCls, 'w-full')}>
                  <span className="text-sm text-white/80">{BAR_TYPES.find((b) => b.value === barType)?.label}</span>
                </SelectTrigger>
                <SelectContent>
                  {BAR_TYPES.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Consent sits directly above the button that creates the bar. Links open in a
              new tab so reading them does not discard the form. */}
          <label className="flex items-start gap-3 rounded-xl border border-white/20 bg-white/5 p-4 cursor-pointer">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-primary cursor-pointer" />
            <span className="text-sm leading-relaxed text-white/80">
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener" className="text-white underline underline-offset-2">Terms of Service</a>{' '}
              and{' '}
              <a href="/privacy" target="_blank" rel="noopener" className="text-white underline underline-offset-2">Privacy Policy</a>
              , and I am authorized to accept them for this business.
            </span>
          </label>

          {error && (
            <p role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
          )}

          {!ready && !loading && (
            <p className="text-center text-sm text-white/80">
              {!name.trim() ? 'Enter your bar name to continue.' : !state ? 'Choose a state to continue.'
                : !timezone ? 'Choose a time zone to continue.' : 'Agree to the terms to continue.'}
            </p>
          )}
          <Button type="submit" disabled={loading || !ready}
            className="w-full h-12 text-base font-semibold disabled:opacity-100 disabled:bg-white/15 disabled:text-white/70 bg-cta text-cta-foreground hover:brightness-95">
            {loading ? 'Creating your bar…' : 'Create my bar'}
          </Button>
          <p className="text-center text-xs text-white/80">
            Tip rules and pay rates come next, from your checklist. Nothing here is final.
          </p>
        </form>
      </div>
    </main>
  );
}
