import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Package, CircleDollarSign, BarChart2,
  TrendingUp, FileText, ShoppingCart,
  CheckCircle, Star, ChevronRight,
} from 'lucide-react';
import { DemoButton } from './_components/landing/demo-button';
import { DemoRequestFormLazy } from './_components/landing/demo-request-form-lazy';
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from '@/lib/site';

// The only indexable route in the app, so it owns the canonical URL.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph:  { url: '/' },
};

const FEATURES = [
  { icon: Package,          title: 'Real-Time Inventory',       color: 'text-teal-500 bg-teal-500/10',    desc: 'Track every bottle, keg, and ingredient with live stock levels and instant low-stock alerts.' },
  { icon: CircleDollarSign, title: 'Payroll & Tip Splits',       color: 'text-amber-500 bg-amber-500/10',  desc: 'Automated payroll, pooled tip distribution, barback allocations, and opener bonuses in seconds.' },
  { icon: BarChart2,        title: 'Nightly Z-Report Analytics', color: 'text-blue-500 bg-blue-500/10',    desc: 'Import Z reports and instantly see sales trends, tip percentages, and per-server performance.' },
  { icon: ShoppingCart,     title: 'Rep & Supplier Orders',      color: 'text-violet-500 bg-violet-500/10',desc: 'Manage distributors, send purchase orders by email or SMS, and keep a full order history.' },
  { icon: TrendingUp,       title: 'Smart Auto-Reorder',         color: 'text-emerald-500 bg-emerald-500/10',desc: 'When stock drops below par, Rail flags it and lets you place an order in one click.' },
  { icon: FileText,         title: 'Tax & W-2 Reports',          color: 'text-rose-500 bg-rose-500/10',    desc: 'Generate W-2 drafts, 1099-NECs, and comprehensive tax summaries for your accountant.' },
];

const STEPS = [
  { n: '01', title: 'Connect your POS',   desc: 'Link Clover, Toast, or 2TouchPOS — or simply import CSV exports from any system.' },
  { n: '02', title: 'Track in real time', desc: 'Rail syncs inventory, imports Z reports, and calculates payroll automatically every night.' },
  { n: '03', title: 'Run your operation', desc: 'Catch problems early, pay staff correctly, and reorder supplies before you ever run out.' },
];

const BAR_TYPES = [
  { label: 'Cocktail Bar',     emoji: '🍸' }, { label: 'Nightclub',       emoji: '🎵' },
  { label: 'Sports Bar',       emoji: '🏈' }, { label: 'Restaurant + Bar',emoji: '🍽️' },
  { label: 'Brewery',          emoji: '🍺' }, { label: 'Hotel Bar',        emoji: '🏨' },
];

const TESTIMONIALS = [
  { quote: "Rail saved me at least 5 hours a week. I used to dread Thursday inventory — now it takes 20 minutes and I trust the numbers.", name: 'Sarah M.',    title: 'Owner, The Harbor Lounge',                  initials: 'SM', color: 'bg-teal-500' },
  { quote: "The tip tracking alone is worth it. No more arguments Saturday night — everyone can see exactly how the pool was split.", name: 'Marcus T.',  title: 'Bar Manager, District 14',                  initials: 'MT', color: 'bg-amber-500' },
  { quote: "We were losing thousands in untracked pours. Rail's cost-per-pour calculator showed us exactly where the waste was. Eye-opening.", name: 'Jennifer K.', title: 'Operations Director, Three Sisters Brewing', initials: 'JK', color: 'bg-violet-500' },
];

const STATS = [
  { value: '28+',  label: 'Inventory items tracked'       },
  { value: '5 hrs',label: 'Saved per week on average'     },
  { value: '100%', label: 'Automated tip calculations'    },
  { value: '$0',   label: 'Extra for payroll reports'     },
];

// ── Page ────────────────────────────────────────────────────────────────────

/**
 * Structured data describing the product and the organisation.
 *
 * Deliberately omits Review / AggregateRating. The testimonials rendered below
 * are illustrative copy, not collected customer feedback — publishing them as
 * schema.org reviews would misrepresent them to search engines as verified
 * ratings. Add those only once they are backed by real, attributable reviews.
 *
 * `offers` is likewise omitted rather than invented: Rail has no public price.
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id':   `${SITE_URL}/#organization`,
      name:    SITE_NAME,
      url:     SITE_URL,
      description: SITE_DESCRIPTION,
    },
    {
      '@type': 'WebSite',
      '@id':   `${SITE_URL}/#website`,
      url:     SITE_URL,
      name:    SITE_NAME,
      description: SITE_DESCRIPTION,
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'en-US',
    },
    {
      '@type': 'SoftwareApplication',
      '@id':   `${SITE_URL}/#software`,
      name:    SITE_NAME,
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: SITE_TAGLINE,
      operatingSystem: 'Web',
      url:         SITE_URL,
      description: SITE_DESCRIPTION,
      publisher:   { '@id': `${SITE_URL}/#organization` },
      featureList: FEATURES.map(f => f.title),
    },
  ],
};

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 flex flex-col">
      {/* Escaping `<` guards against HTML injection if any of the strings above
          ever become dynamic — per the Next.js JSON-LD guide. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />

      {/* ── Sticky Nav ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <span className="font-black text-xl tracking-[0.2em] uppercase text-slate-900">Rail</span>
          <nav className="hidden md:flex items-center gap-8">
            {([['Features','#features'],['How it works','#how-it-works'],['Contact','#contact']] as [string,string][]).map(([label, href]) => (
              <a key={href} href={href} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">{label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors hidden sm:block">Sign in</Link>
            <DemoButton size="sm" />
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-slate-900 text-white">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=1920&q=80')" }} />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-900/80 to-teal-950/70" />
        </div>
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-28 sm:py-36">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-4 py-1.5 text-xs font-semibold tracking-widest uppercase text-teal-300 mb-6">
              Bar Management Platform
            </span>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black leading-tight tracking-tight mb-6">
              The Smarter Way<br /><span className="text-teal-400">to Run Your Bar</span>
            </h1>
            <p className="text-lg sm:text-xl text-white/65 leading-relaxed mb-10 max-w-xl">
              Real-time inventory, automated payroll, tip tracking, and supplier management —
              built specifically for bar operators.
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <a href="#contact" className="inline-flex items-center gap-2 h-12 px-8 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-semibold text-base transition-colors">
                Request a Demo <ArrowRight className="h-4 w-4" />
              </a>
              <DemoButton size="lg" className="border-white/25 text-white hover:bg-white/10 hover:border-white/40" />
            </div>
            <p className="mt-4 text-xs text-white/35 flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5" /> Demo uses realistic fake data — no credit card required
            </p>
          </div>
        </div>

        {/* Stat bar */}
        <div className="relative z-10 border-t border-white/10">
          <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:divide-x divide-white/10">
            {STATS.map(({ value, label }) => (
              <div key={label} className="sm:px-8 first:pl-0">
                <p className="text-2xl font-black text-teal-400 tabular-nums">{value}</p>
                <p className="text-xs text-white/50 mt-0.5 leading-snug">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo disclaimer ─────────────────────────────────────────────── */}
      <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 text-center">
        <p className="text-xs text-amber-700">
          <strong>Demo accounts</strong> contain pre-loaded fake data for &ldquo;The Tipsy Tavern&rdquo; — no real bar data is used or stored.
          Demo sessions may be cleared periodically.
        </p>
      </div>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="features" className="py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold tracking-widest uppercase text-teal-600">Everything you need</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2 text-slate-900">One platform. All your operations.</h2>
            <p className="text-slate-500 mt-3 max-w-xl mx-auto">Rail replaces the spreadsheets, whiteboards, and mental math that bar managers rely on today.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${color}`}><Icon className="h-5 w-5" /></div>
                <div>
                  <h3 className="font-semibold text-slate-900">{title}</h3>
                  <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold tracking-widest uppercase text-teal-600">Simple setup</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2 text-slate-900">Up and running in minutes</h2>
          </div>
          <div className="grid gap-10 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.n} className="flex flex-col items-start gap-4">
                <div className="h-14 w-14 rounded-2xl bg-teal-500 text-white flex items-center justify-center font-black text-lg shrink-0">{step.n}</div>
                <div>
                  <h3 className="font-semibold text-lg text-slate-900">{step.title}</h3>
                  <p className="text-slate-600 text-sm mt-1.5 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bar types ──────────────────────────────────────────────────── */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-center text-lg font-semibold text-slate-400 mb-8 uppercase tracking-widest text-sm">Built for every type of venue</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {BAR_TYPES.map(({ label, emoji }) => (
              <span key={label} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm">
                <span>{emoji}</span>{label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="flex justify-center gap-1 mb-4">{[...Array(5)].map((_, i) => <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />)}</div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">Loved by bar operators</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map(({ quote, name, title, initials, color }) => (
              <div key={name} className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-4 flex flex-col">
                <div className="flex gap-1">{[...Array(5)].map((_, i) => <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />)}</div>
                <p className="text-slate-700 text-sm leading-relaxed flex-1">&ldquo;{quote}&rdquo;</p>
                <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                  <div className={`h-9 w-9 rounded-full ${color} text-white flex items-center justify-center text-xs font-bold shrink-0`}>{initials}</div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{name}</p>
                    <p className="text-xs text-slate-500">{title}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="py-20 bg-teal-600 text-white">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">See Rail in action — right now</h2>
          <p className="text-teal-100 max-w-xl mx-auto text-lg">
            Launch a fully pre-loaded demo bar in seconds. No signup, no credit card, no commitment.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <DemoButton size="lg" className="bg-white border-white text-teal-700 hover:bg-teal-50 hover:text-teal-800" />
            <a href="#contact" className="inline-flex items-center gap-2 text-teal-100 hover:text-white font-medium transition-colors">
              Or schedule a guided demo <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ── Contact / Demo form ─────────────────────────────────────────── */}
      <section id="contact" className="py-24 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] items-start">
            {/* Left: copy */}
            <div className="space-y-6 lg:sticky lg:top-24">
              <div>
                <span className="text-xs font-semibold tracking-widest uppercase text-teal-600">Get in touch</span>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2 text-slate-900">
                  Ready to take back control of your bar?
                </h2>
                <p className="text-slate-600 mt-4 leading-relaxed">
                  Fill out the form and we&rsquo;ll reach out within one business day to schedule a
                  personalised demo or answer any questions.
                </p>
              </div>
              <ul className="space-y-3">
                {['Free 30-minute personalised walkthrough', 'We import your existing inventory', 'No long-term contract required', 'Dedicated onboarding support'].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-slate-700">
                    <CheckCircle className="h-4 w-4 text-teal-500 shrink-0" />{item}
                  </li>
                ))}
              </ul>
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
                <p className="font-semibold text-slate-900 text-sm">Can&rsquo;t wait? Try the demo now.</p>
                <p className="text-slate-500 text-xs">Explore a live demo bar with realistic data — no form needed.</p>
                <div className="pt-1"><DemoButton size="sm" /></div>
              </div>
            </div>
            {/* Right: form */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <h3 className="text-lg font-bold mb-6 text-slate-900">Request a Demo</h3>
              <DemoRequestFormLazy />
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 mb-8">
            <div>
              <p className="font-black text-xl tracking-[0.2em] uppercase">Rail</p>
              <p className="text-slate-400 text-sm mt-1">Bar Management Platform</p>
            </div>
            <div className="flex flex-wrap gap-8 text-sm text-slate-400">
              {[['Features','#features'],['How it works','#how-it-works'],['Contact','#contact']].map(([label, href]) => (
                <a key={href} href={href} className="hover:text-white transition-colors">{label}</a>
              ))}
              <Link href="/login" className="hover:text-white transition-colors">Sign in</Link>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500">&copy; {new Date().getFullYear()} Rail. All rights reserved.</p>
            <p className="text-xs text-slate-600">Built for bar operators. Not affiliated with any POS vendor.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
