'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createOrgWithSettings } from './actions';

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    tip_split_percent: 15,
    default_hourly_rate: 15,
  });

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

  return (
    <main className="relative min-h-dvh flex items-center justify-center p-6 overflow-hidden bg-gray-950">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-950 to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(168,85,247,0.08),transparent_60%)]" />

      <div className="relative z-10 w-full max-w-lg">
        <div className="text-center mb-8">
          <p className="text-white font-black text-3xl tracking-[0.25em] uppercase mb-3">Rail</p>
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <div className="h-px w-8 bg-white/20" />
              <div className="h-2 w-2 rounded-full bg-white/20" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Set up your bar</h1>
          <p className="text-white/40 text-sm mt-1.5">Step 1 of 2 — takes about 30 seconds</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-3">
            <Label className="text-white/70 text-xs font-semibold uppercase tracking-widest">Bar name</Label>
            <Input
              autoFocus
              required
              placeholder="The Tipsy Tavern"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/25 focus-visible:ring-primary/50 text-lg h-12"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-4">
            <div>
              <Label className="text-white/70 text-xs font-semibold uppercase tracking-widest">Defaults</Label>
              <p className="text-white/35 text-xs mt-1">Used for payroll and tip calculations — editable any time</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-white/55 text-xs">Tip Split %</Label>
                <div className="relative">
                  <Input
                    type="number" min={0} max={100}
                    value={form.tip_split_percent}
                    onChange={(e) => setForm({ ...form, tip_split_percent: Number(e.target.value) })}
                    className="bg-white/10 border-white/20 text-white focus-visible:ring-primary/50 pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 text-sm">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/55 text-xs">Default Hourly Rate</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 text-sm">$</span>
                  <Input
                    type="number" min={0} step="0.01"
                    value={form.default_hourly_rate}
                    onChange={(e) => setForm({ ...form, default_hourly_rate: Number(e.target.value) })}
                    className="bg-white/10 border-white/20 text-white focus-visible:ring-primary/50 pl-7"
                  />
                </div>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || !form.name.trim()}
            className="w-full h-12 text-base font-semibold bg-white text-gray-900 hover:bg-white/90"
          >
            {loading ? 'Saving…' : 'Continue →'}
          </Button>
        </form>
      </div>
    </main>
  );
}
