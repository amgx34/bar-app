'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Monitor, Leaf, Flame, ArrowRight, CheckCircle, Zap, Upload, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { selectPOSProvider } from '../actions';
import { save2TouchConfig } from '@/app/(app)/app/settings/actions';

const POS = [
  {
    value: '2touch' as const,
    name: '2TouchPOS',
    tagline: 'Needs the Rail connector',
    description:
      'Import nightly Z reports and employee shift files to power payroll, tip splits, and inventory. The full Rail workflow is built around 2Touch exports.',
    features: ['Z report import (text & CSV)', 'Employee shift imports', 'Auto tip pool splits', 'Full payroll calculator'],
    status: 'ready',
    statusLabel: 'Needs the connector',
    Icon: Monitor,
    accent: 'blue',
    border: 'border-blue-500/30',
    activeBorder: 'border-blue-400 ring-1 ring-blue-400',
    bg: 'bg-blue-500/8',
    activeBg: 'bg-blue-500/15',
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/15',
    statusColor: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
    cta: 'Get started with 2Touch',
  },
  {
    value: 'clover' as const,
    name: 'Clover',
    tagline: 'Read-only API sync',
    description:
      'Connect your Clover account through Clover\'s own sign-in. Rail reads your sales once a night and when you open the app, and never writes to Clover or sees your Clover password.',
    features: ['Nightly sales, tips and cash/card totals', 'Items sold, which deplete stock', 'Hourly and per-server sales', 'Employee hours'],
    status: 'setup',
    statusLabel: 'Requires connection',
    Icon: Leaf,
    accent: 'green',
    border: 'border-green-500/30',
    activeBorder: 'border-green-400 ring-1 ring-green-400',
    bg: 'bg-green-500/8',
    activeBg: 'bg-green-500/15',
    iconColor: 'text-green-400',
    iconBg: 'bg-green-500/15',
    statusColor: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
    cta: 'Set up Clover integration',
  },
  {
    value: 'toast' as const,
    name: 'Toast',
    tagline: 'API sync, needs Toast API access',
    description:
      'Rail reads your sales from the Toast API once a night and on demand. Toast sells and approves API access separately from the POS, so you need to ask Toast for read-only credentials first.',
    features: ['Nightly sales, tips and cash/card totals', 'Items sold, which deplete stock', 'Hourly and per-server sales', 'Employee hours and declared cash tips'],
    status: 'setup',
    statusLabel: 'Requires Toast API access',
    Icon: Flame,
    accent: 'orange',
    border: 'border-orange-500/30',
    activeBorder: 'border-orange-400 ring-1 ring-orange-400',
    bg: 'bg-orange-500/8',
    activeBg: 'bg-orange-500/15',
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/15',
    statusColor: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
    cta: 'Set up Toast integration',
  },
] as const;

const FEATURE_ICONS = {
  '2touch': Upload,
  clover: RefreshCw,
  toast: RefreshCw,
} as const;

interface Props { orgId: string }

export default function POSSelector({ orgId: _ }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<typeof POS[number]['value'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  async function handleContinue() {
    if (!selected) return;
    setLoading(true);
    try {
      if (selected === '2touch') {
        // Creates the agent token now, so the code exists at the step that needs it.
        const cfg = await save2TouchConfig('');
        setPairingCode(cfg.pairingCode);
        setLoading(false);
        return;
      }
      await selectPOSProvider(selected);
      if (selected === 'clover' || selected === 'toast') {
        router.push(`/setup/pos/${selected}`);
      } else {
        router.push('/app/dashboard');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  if (pairingCode) return <PairingStep code={pairingCode} onDone={() => router.push('/app/dashboard')} />;

  return (
    <main className="relative min-h-dvh flex flex-col items-center justify-center p-6 overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className="absolute inset-0 bg-gradient-to-b from-sidebar-accent via-sidebar to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.06),transparent_60%)]" />

      <div className="relative z-10 w-full max-w-4xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <p className="text-white font-black text-3xl tracking-[0.25em] uppercase">Rail</p>
          <div className="flex items-center justify-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-white/30" />
              <div className="h-px w-8 bg-white/20" />
              <div className="h-2 w-2 rounded-full bg-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Choose your POS system</h1>
          <p className="text-white/70 text-sm">Step 2 of 2: this determines how Rail imports your data</p>
        </div>

        {/* POS cards */}
        <div className="grid gap-4 lg:grid-cols-3">
          {POS.map((pos) => {
            const active = selected === pos.value;
            const FeatureIcon = FEATURE_ICONS[pos.value];
            return (
              <button
                key={pos.value}
                type="button"
                onClick={() => setSelected(pos.value)}
                className={cn(
                  'rounded-2xl border p-5 text-left transition-all duration-200 flex flex-col gap-4 group',
                  active
                    ? cn(pos.activeBorder, pos.activeBg)
                    : cn(pos.border, pos.bg, 'hover:brightness-125')
                )}
              >
                {/* Icon + status */}
                <div className="flex items-start justify-between">
                  <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center', pos.iconBg)}>
                    <pos.Icon className={cn('h-5 w-5', pos.iconColor)} />
                  </div>
                  <span className={cn('text-[10px] font-semibold rounded-full border px-2.5 py-0.5 uppercase tracking-wide', pos.statusColor)}>
                    {pos.statusLabel}
                  </span>
                </div>

                {/* Name + tagline */}
                <div>
                  <p className="font-bold text-white text-base">{pos.name}</p>
                  <p className={cn('text-xs font-medium mt-0.5', pos.iconColor)}>{pos.tagline}</p>
                </div>

                {/* Description */}
                <p className="text-xs text-white/50 leading-relaxed flex-1">{pos.description}</p>

                {/* Features */}
                <ul className="space-y-1.5">
                  {pos.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-white/60">
                      <FeatureIcon className={cn('h-3 w-3 shrink-0', pos.iconColor)} />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* Selection indicator */}
                <div className={cn(
                  'flex items-center gap-1.5 text-xs font-medium transition-opacity',
                  active ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'
                )}>
                  <CheckCircle className={cn('h-3.5 w-3.5', active ? pos.iconColor : 'text-white/70')} />
                  <span className={active ? pos.iconColor : 'text-white/70'}>
                    {active ? 'Selected' : 'Select this'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Continue button */}
        <div className="flex flex-col items-center gap-3">
          <button
            disabled={!selected || loading}
            onClick={handleContinue}
            className={cn(
              'flex items-center gap-2 px-8 h-12 rounded-xl font-semibold text-base transition-all',
              selected
                ? 'bg-cta text-cta-foreground hover:brightness-95 cursor-pointer'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            )}
          >
            {loading ? 'Setting up…' : (
              <>
                {selected === 'clover' ? 'Continue to Clover setup' : selected === 'toast' ? 'Continue to Toast setup' : 'Continue'}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          {!selected && (
            <p className="text-white/70 text-xs">Select a POS above to continue</p>
          )}
        </div>
      </div>
    </main>
  );
}

function PairingStep({ code, onDone }: { code: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      toast.error('Could not copy. Select the code and copy it by hand.');
    }
  }
  return (
    <main className="relative min-h-dvh flex items-center justify-center p-6 bg-sidebar text-sidebar-foreground">
      <div className="w-full max-w-lg space-y-5">
        <h1 className="text-2xl font-bold text-white">Your pairing code</h1>
        <p className="text-sm text-white/70">
          The Rail connector on your 2Touch computer asks for this code the first time it runs. Until it is installed
          and paired, no sales reach Rail. The code is also in Settings under POS, so you can leave this page.
        </p>
        <label htmlFor="pairing-code" className="block text-xs font-medium text-white/60">Pairing code</label>
        <textarea
          id="pairing-code" readOnly rows={4} value={code}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full resize-none rounded-lg border border-white/20 bg-black/30 p-3 font-mono text-xs text-white break-all"
        />
        <p className="text-xs text-white/60">Treat it like a password. Anyone with it can send data as your bar.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={copy} className="min-h-11 rounded-xl bg-white/10 px-5 font-semibold text-white hover:bg-white/15">
            {copied ? 'Copied' : 'Copy code'}
          </button>
          <button type="button" onClick={onDone} className="min-h-11 rounded-xl bg-cta px-5 font-semibold text-cta-foreground hover:brightness-95">
            Go to dashboard
          </button>
        </div>
        <p role="status" className="sr-only">{copied ? 'Pairing code copied' : ''}</p>
      </div>
    </main>
  );
}
