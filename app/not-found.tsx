import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page not found',
  // No `robots` here on purpose: Next.js already emits <meta name="robots"
  // content="noindex"> for not-found, and adding our own produced a duplicate
  // robots tag in the served HTML. Bare `noindex` still implies follow.
};

export default function NotFound() {
  return (
    <main className="min-h-dvh bg-slate-50 text-slate-900 flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold tracking-widest uppercase text-teal-600">
          404
        </p>

        <h1 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight">
          We couldn&apos;t find that page
        </h1>

        <p className="mt-4 text-slate-600 leading-relaxed">
          The link may be out of date, or the page may have moved. Everything
          else is still where you left it.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-semibold transition-colors w-full sm:w-auto"
          >
            Back to home
          </Link>
          <Link
            href="/app/dashboard"
            className="inline-flex items-center justify-center h-11 px-6 rounded-xl border border-slate-300 hover:bg-slate-100 font-semibold transition-colors w-full sm:w-auto"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
