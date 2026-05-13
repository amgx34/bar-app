import { redirect } from 'next/navigation';
import { getCurrentOrg } from '@/lib/org';
import { Leaf, ExternalLink, ArrowRight, CheckCircle, Shield, Zap, Package } from 'lucide-react';
import Link from 'next/link';

export default async function CloverConnectPage() {
  const { org } = await getCurrentOrg();

  // Already connected — go to dashboard
  const cfg = org.pos_config as { access_token?: string } | null;
  if (cfg?.access_token) redirect('/app/dashboard');

  const authUrl = buildCloverAuthUrl(org.id);

  return (
    <main className="relative min-h-dvh flex items-center justify-center p-6 overflow-hidden bg-gray-950">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-950 to-black" />
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
          <p className="text-white/40 text-sm">You'll be redirected to Clover to authorize access</p>
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
            Rail will request read access to your Clover merchant account. You'll approve this on Clover's site — Rail never stores your Clover password.
          </p>

          {/* What Rail can access */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Rail will be able to</p>
            <ul className="space-y-2">
              {[
                { icon: Package, text: 'Read your item catalog and inventory counts' },
                { icon: Zap, text: 'Pull nightly sales and tip totals' },
                { icon: Shield, text: 'Never write to or modify your Clover data' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5 text-sm text-white/55">
                  <Icon className="h-4 w-4 text-green-400 shrink-0" />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {/* Connect button */}
          {authUrl ? (
            <a href={authUrl} className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-green-500 hover:bg-green-400 text-white font-semibold transition-colors text-sm">
              <ExternalLink className="h-4 w-4" />
              Authorize with Clover
            </a>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
              <strong>CLOVER_CLIENT_ID</strong> and <strong>CLOVER_REDIRECT_URI</strong> must be set in your environment before connecting.
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

function buildCloverAuthUrl(orgId: string): string | null {
  const clientId = process.env.CLOVER_CLIENT_ID;
  const redirectUri = process.env.CLOVER_REDIRECT_URI;
  if (!clientId || !redirectUri) return null;

  const base =
    process.env.CLOVER_SANDBOX === 'true'
      ? 'https://sandbox.dev.clover.com/oauth/v2/authorize'
      : 'https://www.clover.com/oauth/v2/authorize';

  const url = new URL(base);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', orgId);
  return url.toString();
}
