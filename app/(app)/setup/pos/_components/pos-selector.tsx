'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Monitor, Leaf, Flame, ArrowRight, CheckCircle, Zap, Upload, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { selectPOSProvider } from '../actions';

const POS = [
  {
    value: '2touch' as const,
    name: '2TouchPOS',
    tagline: 'Ready to use right now',
    description:
      'Import nightly Z reports and employee shift files to power payroll, tip splits, and inventory. The full Rail workflow is built around 2Touch exports.',
    features: ['Z report import (text & CSV)', 'Employee shift imports', 'Auto tip pool splits', 'Full payroll calculator'],
    status: 'ready',
    statusLabel: 'No setup required',
    Icon: Monitor,
    accent: 'blue',
    border: 'border-blue-500/30',
    activeBorder: 'border-blue-400 ring-1 ring-blue-400',
    bg: 'bg-blue-500/8',
    activeBg: 'bg-blue-500/15',
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/15',
    statusColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    cta: 'Get started with 2Touch',
  },
  {
    value: 'clover' as const,
    name: 'Clover',
    tagline: 'Full two-way integration',
    description:
      "Connect your Clover account via OAuth to automatically sync your item catalog and inventory counts. Sales data flows directly from Clover — no manual imports needed.",
    features: ['Live inventory sync from Clover', 'Auto item catalog import', 'Sales data pull', 'OAuth 2.0 connection'],
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
    tagline: 'Manual import workflow',
    description:
      'Use Toast CSV and text exports to import shift data and Z reports. The same powerful payroll and tip-tracking tools, fed by your Toast POS exports.',
    features: ['CSV export imports', 'Shift data support', 'Tip pool calculations', 'Toast API integration coming soon'],
    status: 'ready',
    statusLabel: 'Available now',
    Icon: Flame,
    accent: 'orange',
    border: 'border-orange-500/30',
    activeBorder: 'border-orange-400 ring-1 ring-orange-400',
    bg: 'bg-orange-500/8',
    activeBg: 'bg-orange-500/15',
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/15',
    statusColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    cta: 'Get started with Toast',
  },
] as const;

const FEATURE_ICONS = {
  '2touch': Upload,
  clover: RefreshCw,
  toast: Upload,
} as const;

interface Props { orgId: string }

export default function POSSelector({ orgId: _ }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<typeof POS[number]['value'] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    if (!selected) return;
    setLoading(true);
    try {
      await selectPOSProvider(selected);
      if (selected === 'clover') {
        router.push('/setup/pos/clover');
      } else {
        router.push('/app/dashboard');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-dvh flex flex-col items-center justify-center p-6 overflow-hidden bg-gray-950">
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-950 to-black" />
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
          <p className="text-white/40 text-sm">Step 2 of 2 — this determines how Rail imports your data</p>
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
                  <CheckCircle className={cn('h-3.5 w-3.5', active ? pos.iconColor : 'text-white/40')} />
                  <span className={active ? pos.iconColor : 'text-white/40'}>
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
                ? 'bg-white text-gray-900 hover:bg-white/90 cursor-pointer'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            )}
          >
            {loading ? 'Setting up…' : (
              <>
                {selected === 'clover' ? 'Continue to Clover setup' : 'Finish setup'}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          {!selected && (
            <p className="text-white/25 text-xs">Select a POS above to continue</p>
          )}
        </div>
      </div>
    </main>
  );
}
