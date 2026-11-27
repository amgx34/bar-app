import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Flame } from 'lucide-react';
import { getCurrentOrg } from '@/lib/org';
import { ToastConnectSection } from './_components/toast-connect-section';

export const metadata: Metadata = { title: 'Connect Toast' };

export default async function ToastConnectPage() {
  const { role } = await getCurrentOrg();

  return (
    <main className="relative min-h-dvh flex items-center justify-center p-6 overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className="absolute inset-0 bg-gradient-to-br from-sidebar-accent via-sidebar to-background dark:to-black" />
      <div className="relative z-10 w-full max-w-lg space-y-6">
        <div className="text-center space-y-3">
          <p className="text-white font-black text-3xl tracking-[0.25em] uppercase mb-2">Rail</p>
          <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
            <Flame className="h-6 w-6 text-orange-400" /> Connect Toast
          </h1>
          <p className="text-white/40 text-sm">Rail reads your sales, tips, items and hours from the Toast API</p>
        </div>

        <div className="rounded-2xl bg-card text-card-foreground p-6">
          {role === 'owner'
            ? <ToastConnectSection />
            : <p className="text-sm text-muted-foreground">Only the owner can connect Toast. Ask the owner to open this page, or to connect it from Settings.</p>}
        </div>

        <div className="text-center">
          <Link href="/app/dashboard" className="text-xs text-white/30 hover:text-white/60 transition-colors inline-flex items-center gap-1">
            Skip for now, connect later in Settings
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </main>
  );
}
