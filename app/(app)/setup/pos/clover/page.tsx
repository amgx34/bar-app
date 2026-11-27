import type { Metadata } from 'next';
import { getCurrentOrg } from '@/lib/org';
import { Leaf, ExternalLink, ArrowRight, Shield, Zap, Package } from 'lucide-react';
import Link from 'next/link';
import { startCloverConnect } from './actions';

export const metadata: Metadata = { title: 'Connect Clover' };

const TIME_ZONES: [string, string][] = [
  ['America/New_York', 'Eastern'], ['America/Chicago', 'Central'], ['America/Denver', 'Mountain'],
  ['America/Phoenix', 'Arizona'], ['America/Los_Angeles', 'Pacific'], ['America/Anchorage', 'Alaska'],
  ['Pacific/Honolulu', 'Hawaii'], ['America/Toronto', 'Toronto'], ['America/Vancouver', 'Vancouver'],
  ['Europe/London', 'London'], ['Europe/Dublin', 'Dublin'], ['Europe/Berlin', 'Central Europe'],
];

export default async function CloverConnectPage() {
  const { org } = await getCurrentOrg();

  const cfg = (org.pos_config ?? {}) as { merchant_id?: string; clover_region?: string; cutoff_hour?: number; timezone?: string };
  const ready = !!(process.env.CLOVER_CLIENT_ID && process.env.CLOVER_REDIRECT_URI && process.env.OAUTH_STATE_SECRET);
  const sandbox = process.env.CLOVER_SANDBOX === 'true';

  return (
    <main className="relative min-h-dvh flex items-center justify-center p-6 overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className="absolute inset-0 bg-gradient-to-br from-sidebar-accent via-sidebar to-background dark:to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(74,222,128,0.06),transparent_60%)]" />

      <div className="relative z-10 w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <p className="text-white font-black text-3xl tracking-[0.25em] uppercase mb-2">Rail</p>
          <div className="flex items-center justify-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-white/30" />
            <div className="h-px w-6 bg-white/20" />
            <div className="h-2 w-2 rounded-full bg-white/30" />
            <div className="h-px w-6 bg-white/20" />
            <div className="h-2 w-2 rounded-full bg-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Connect Clover</h1>
          <p className="text-white/40 text-sm">You&apos;ll be redirected to Clover to authorize access</p>
        </div>

        {/* Connection card */}
        <div className="rounded-2xl border border-green-500/20 bg-green-500/5 backdrop-blur-sm p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-green-500/15 flex items-center justify-center">
              <Leaf className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-white">Clover POS</p>
              <p className="text-xs text-green-400">OAuth 2.0 — secure authorization</p>
            </div>
          </div>

          <p className="text-sm text-white/60 leading-relaxed">
            Rail will request read access to your Clover merchant account. You&apos;ll approve this on Clover&apos;s site — Rail never stores your Clover password.
          </p>

          {/* What Rail can access */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Rail will be able to</p>
            <ul className="space-y-2">
              {[
                { icon: Package, text: 'Read your item catalog' },
                { icon: Zap, text: 'Pull nightly sales, tips, cash and card totals, and items sold' },
                { icon: Package, text: 'Read employees and shifts, when your account allows it' },
                { icon: Shield, text: 'Never write to or modify your Clover data' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5 text-sm text-white/55">
                  <Icon className="h-4 w-4 text-green-400 shrink-0" />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {cfg.merchant_id && (
            <p className="text-xs text-amber-400">
              A Clover account is already connected. Authorizing again replaces its stored login.
            </p>
          )}

          {ready ? (
            <form action={startCloverConnect} className="space-y-4">
              {!sandbox && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Clover region</span>
                  <select name="region" defaultValue={cfg.clover_region ?? 'na'} className="w-full h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white">
                    <option value="na">United States and Canada</option>
                    <option value="eu">Europe</option>
                    <option value="la">Latin America</option>
                  </select>
                </label>
              )}
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Business day ends at (hour)</span>
                <input name="cutoff_hour" type="number" min={0} max={12} defaultValue={cfg.cutoff_hour ?? 4}
                  className="w-full h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white" />
                <span className="block text-xs text-white/35">
                  Clover has no business day. Sales before this hour count toward the night before. 4 suits most bars.
                </span>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Time zone</span>
                <select name="timezone" defaultValue={cfg.timezone ?? ''} className="w-full h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white">
                  <option value="">Use the one Clover reports</option>
                  {TIME_ZONES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
                <span className="block text-xs text-white/35">
                  Only used if Clover does not report your zone. Without one Rail cannot tell which night a sale belongs to.
                </span>
              </label>
              <button type="submit" className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-green-500 hover:bg-green-400 text-white font-semibold transition-colors text-sm">
                <ExternalLink className="h-4 w-4" />
                Authorize with Clover
              </button>
            </form>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
              <strong>CLOVER_CLIENT_ID</strong>, <strong>CLOVER_REDIRECT_URI</strong> and <strong>OAUTH_STATE_SECRET</strong> must be set in your environment before connecting.
            </div>
          )}
        </div>

        {/* Skip */}
        <div className="text-center">
          <Link
            href="/app/dashboard"
            className="text-xs text-white/30 hover:text-white/60 transition-colors inline-flex items-center gap-1"
          >
            Skip for now — connect later in Settings
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </main>
  );
}
