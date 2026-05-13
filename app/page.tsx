import Link from 'next/link';
import { ArrowRight, BarChart2, Package, CircleDollarSign, Zap } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FEATURES = [
  {
    icon: Package,
    title: 'Inventory Control',
    desc: 'Track every bottle, keg, and ingredient. Get low-stock alerts before you run dry mid-shift.',
  },
  {
    icon: CircleDollarSign,
    title: 'Payroll & Tips',
    desc: 'Automated tip splits, payroll calculations, and shift imports straight from your POS.',
  },
  {
    icon: BarChart2,
    title: 'Nightly Analytics',
    desc: 'Sales trends, tip percentages, and staff performance — every metric from your Z reports.',
  },
  {
    icon: Zap,
    title: 'POS Integration',
    desc: 'Connect Clover, Toast, or 2TouchPOS to sync inventory and pull sales data automatically.',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-gray-950 text-white flex flex-col">

      {/* Background */}
      <div className="fixed inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=1920&q=80')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950/60 via-gray-950/80 to-gray-950" />
      </div>

      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/5">
        <span className="font-black text-xl tracking-[0.25em] uppercase text-white">Rail</span>
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent')}
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 py-24 gap-8">
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.35em] uppercase text-white/40 mb-6">
            Bar Management Platform
          </p>
          <h1 className="text-6xl sm:text-8xl font-black tracking-[0.15em] uppercase text-white leading-none">
            Rail
          </h1>
          <p className="text-lg sm:text-xl text-white/50 max-w-xl mx-auto pt-4 leading-relaxed font-light">
            Inventory, payroll, and analytics built for the bar behind the bar. Everything your operation needs, nothing it doesn't.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <Link
            href="/login"
            className={cn(buttonVariants({ size: 'lg' }), 'bg-white text-gray-900 hover:bg-white/90 font-semibold px-8 gap-2')}
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            Already have an account? Sign in →
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 px-6 pb-24 max-w-5xl mx-auto w-full">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-sm p-5 space-y-3"
            >
              <div className="h-9 w-9 rounded-xl bg-white/8 flex items-center justify-center">
                <Icon className="h-4 w-4 text-white/70" />
              </div>
              <p className="font-semibold text-sm text-white">{title}</p>
              <p className="text-xs text-white/45 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 px-8 py-4 flex items-center justify-between">
        <span className="text-xs text-white/25 tracking-widest uppercase font-semibold">Rail</span>
        <p className="text-xs text-white/20">&copy; {new Date().getFullYear()} All rights reserved</p>
      </footer>

    </div>
  );
}
