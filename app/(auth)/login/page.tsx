import Link from 'next/link';
import { Suspense } from 'react';
import { LoginForm } from './login-form';
import { ArrowLeft, Zap } from 'lucide-react';

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh grid place-items-center p-6 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=1920&q=80')",
        }}
      />
      <div className="absolute inset-0 bg-gray-900/65" />
      <div className="relative z-10 w-full flex flex-col items-center gap-6">
        <p className="text-white/40 text-xs font-medium tracking-widest uppercase select-none">
          Rail
        </p>
        <Suspense>
          <LoginForm />
        </Suspense>

        {/* Back to home + demo */}
        <div className="flex flex-col items-center gap-3">
          <Link
            href="/api/demo"
            className="flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            <Zap className="h-4 w-4 text-amber-400" />
            Try the live demo
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </Link>
        </div>

        <p className="text-white/25 text-[11px]">
          &copy; {new Date().getFullYear()} All rights reserved
        </p>
      </div>
    </main>
  );
}
