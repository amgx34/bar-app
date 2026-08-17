import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Package, CircleDollarSign, BarChart2,
  TrendingUp, FileText, ShoppingCart,
  CheckCircle2, ChevronRight,
  Martini, Music, Trophy, UtensilsCrossed, Beer, BedDouble,
  ClipboardX, Calculator, AlertTriangle,
} from 'lucide-react';
import { DemoButton } from './_components/landing/demo-button';
import { DemoRequestFormLazy } from './_components/landing/demo-request-form-lazy';
import { StickyCta } from './_components/landing/sticky-cta';
import { MobileNav } from './_components/landing/mobile-nav';
import { ScrollProgress } from './_components/scroll-progress';
import { AttributionTracker } from './_components/attribution-tracker';
import { BackToTop } from './_components/back-to-top';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, BUSINESS } from '@/lib/site';

// The only indexable route in the app, so it owns the canonical URL.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph:  { url: '/' },
};

const FEATURES = [
  { icon: Package,          title: 'Real-Time Inventory',       desc: 'Track every bottle, keg, and ingredient with live stock levels and instant low-stock alerts.' },
  { icon: CircleDollarSign, title: 'Payroll & Tip Splits',      desc: 'Automated payroll, pooled tip distribution, barback allocations, and opener bonuses in seconds.' },
  { icon: BarChart2,        title: 'Nightly Z-Report Analytics',desc: 'Import Z reports and instantly see sales trends, tip percentages, and per-server performance.' },
  { icon: ShoppingCart,     title: 'Rep & Supplier Orders',     desc: 'Manage distributors, send purchase orders by email or SMS, and keep a full order history.' },
  { icon: TrendingUp,       title: 'Smart Auto-Reorder',        desc: 'When stock drops below par, Rail flags it and lets you place an order in one click.' },
  { icon: FileText,         title: 'Tax & W-2 Reports',         desc: 'Generate W-2 drafts, 1099-NECs, and comprehensive tax summaries for your accountant.' },
];

// The "problem" beat the design system's pattern calls for before the solution.
const PROBLEMS = [
  { icon: ClipboardX,    title: 'Inventory lives on a clipboard', desc: 'Counts get copied into a spreadsheet days later, by which point the number is already wrong.' },
  { icon: Calculator,    title: 'Tip math happens at 3 a.m.',     desc: 'Pooled tips, barback cuts, and opener bonuses get worked out by hand — and get disputed the next shift.' },
  { icon: AlertTriangle, title: 'Shrinkage shows up too late',    desc: 'Over-pours and waste only surface at the end of the month, long after you could have acted on them.' },
];

const STEPS = [
  { n: '01', title: 'Connect your POS',   desc: 'Link Clover, Toast, or 2TouchPOS — or simply import CSV exports from any system.' },
  { n: '02', title: 'Track in real time', desc: 'Rail syncs inventory, imports Z reports, and calculates payroll automatically every night.' },
  { n: '03', title: 'Run your operation', desc: 'Catch problems early, pay staff correctly, and reorder supplies before you ever run out.' },
];

// SVG icons, not emoji — MASTER.md forbids emoji-as-icon.
const BAR_TYPES = [
  { label: 'Cocktail Bar',      icon: Martini },
  { label: 'Nightclub',         icon: Music },
  { label: 'Sports Bar',        icon: Trophy },
  { label: 'Restaurant + Bar',  icon: UtensilsCrossed },
  { label: 'Brewery',           icon: Beer },
  { label: 'Hotel Bar',         icon: BedDouble },
];

/**
 * Replaces the testimonial block that used to sit here.
 *
 * Those three quotes were written as illustrative copy, not collected from
 * customers — the code said so, and Review schema was deliberately omitted to
 * avoid misrepresenting them to search engines. Rendered with names and star
 * ratings they still read as real endorsements to a visitor, so they are gone.
 * An FAQ occupies the same position in the page and is answerable honestly.
 */
const FAQS: { q: string; a: string }[] = [
  {
    q: 'Do I have to switch POS systems?',
    a: 'No. Rail reads from the POS you already run. There is a direct integration for Clover, Toast and 2TouchPOS, and for anything else you can import the CSV or text exports your system already produces.',
  },
  {
    q: 'How does Rail get my sales data?',
    a: 'Three ways, depending on your setup. A small agent installed on the POS machine syncs automatically every few minutes; a nightly email report can be ingested for you; or you upload the export by hand whenever you want.',
  },
  {
    q: 'How long does setup take?',
    a: 'Connecting a POS and importing your existing inventory usually takes under an hour. You can try the demo immediately without setting anything up.',
  },
  {
    q: 'Can I move my existing inventory across?',
    a: 'Yes. Import a spreadsheet, a supplier invoice, or a POS item export and Rail will match items to what is already there rather than creating duplicates. We will do the first import with you.',
  },
  {
    q: 'Who can see my bar’s data?',
    a: 'Only people you invite to your bar. Each bar’s data is isolated from every other. Bank details for direct deposit are encrypted before they are stored, and only the last four digits are ever shown back.',
  },
  {
    q: 'Does Rail use AI on my data?',
    a: 'Only to read files you import that are not in a recognised format. In that case the file’s text — which can include employee names, hours and tips — is sent to a third-party model to extract the figures. It is never used to train a model. Our privacy policy sets out exactly what is sent and when.',
  },
  {
    q: 'What does it cost?',
    a: 'Pricing depends on the size of your operation, so there is no public price list. Request a demo and we will quote you on the call — no obligation and no long-term contract.',
  },
  {
    q: 'What happens to my data if I stop using Rail?',
    a: 'You can export it at any time, and we delete your account data within 30 days of closure except where tax rules require us to retain records.',
  },
];

const STATS = [
  { value: '28+',   label: 'Inventory items tracked'   },
  { value: '5 hrs', label: 'Saved per week on average' },
  { value: '100%',  label: 'Automated tip calculations'},
  { value: '$0',    label: 'Extra for payroll reports' },
];

// ── Page ────────────────────────────────────────────────────────────────────

/**
 * Structured data describing the product and the organisation.
 *
 * Deliberately omits Review / AggregateRating. The illustrative testimonials
 * this page used to carry have been removed; until there are real, attributable
 * reviews to point at, publishing rating markup would tell search engines
 * something untrue.
 *
 * `offers` is likewise omitted rather than invented: Rail has no public price.
 * The FAQPage node below is safe by contrast — it describes content genuinely
 * on the page.
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      // LocalBusiness once a street address is set in lib/site.ts; Organization
      // until then. Claiming LocalBusiness without a real address would be
      // asserting a physical presence that does not exist.
      '@type': BUSINESS.streetAddress ? 'LocalBusiness' : 'Organization',
      '@id':   `${SITE_URL}/#organization`,
      name:    SITE_NAME,
      url:     SITE_URL,
      description: SITE_DESCRIPTION,
      email:   BUSINESS.email,
      areaServed: BUSINESS.areaServed,
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'sales',
        email: BUSINESS.email,
        areaServed: BUSINESS.areaServed,
        availableLanguage: 'English',
        ...(BUSINESS.telephone ? { telephone: BUSINESS.telephone } : {}),
      },
      // Every address field is omitted unless genuinely known — a partial or
      // invented PostalAddress is worse than none.
      ...(BUSINESS.streetAddress
        ? {
            address: {
              '@type': 'PostalAddress',
              streetAddress:   BUSINESS.streetAddress,
              addressLocality: BUSINESS.addressLocality,
              addressRegion:   BUSINESS.addressRegion,
              postalCode:      BUSINESS.postalCode,
              addressCountry:  BUSINESS.addressCountry,
            },
          }
        : {}),
      ...(BUSINESS.telephone ? { telephone: BUSINESS.telephone } : {}),
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
      // Unlike the Review schema deliberately omitted above, this describes
      // content genuinely present on the page and written by us — so it is a
      // truthful claim to make to a search engine.
      '@type': 'FAQPage',
      '@id':   `${SITE_URL}/#faq`,
      mainEntity: FAQS.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
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

const NAV_LINKS: [string, string][] = [
  ['Features', '#features'],
  ['How it works', '#how-it-works'],
  ['FAQ', '#faq'],
  ['Contact', '#contact'],
];

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      {/* Escaping `<` guards against HTML injection if any of the strings above
          ever become dynamic — per the Next.js JSON-LD guide. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />

      <AttributionTracker />
      <ScrollProgress />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-3 focus:left-3 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:font-semibold focus:text-primary"
      >
        Skip to content
      </a>

      {/* ── Sticky Nav ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-card/90 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
          <span className="font-heading font-bold text-lg tracking-[0.3em] uppercase text-primary">
            Rail
          </span>
          <nav aria-label="Primary" className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors duration-200"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors duration-200 hidden sm:inline-flex items-center"
            >
              Sign in
            </Link>
            <a
              href="#contact"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-cta text-cta-foreground font-semibold text-sm hover:brightness-95 transition-[filter] duration-200"
            >
              Request a demo
            </a>
            {/* Below md the nav above is hidden; this is where those links live. */}
            <MobileNav links={NAV_LINKS} />
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
          {/* Hairline data-grid motif rather than a stock photo: it matches the
              "Data-Dense Dashboard" style and drops a 1920px external request. */}
          <div aria-hidden className="absolute inset-0 grid-texture text-sidebar-foreground opacity-40" />
          <div
            aria-hidden
            className="absolute -top-40 -right-32 h-[28rem] w-[28rem] rounded-full opacity-20 blur-3xl"
            style={{ background: 'radial-gradient(circle, var(--primary), transparent 70%)' }}
          />

          <div className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-14 sm:pt-28 sm:pb-20">
            <div className="grid lg:grid-cols-[1.15fr_1fr] gap-14 items-center">
              <div>
                <span className="inline-flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-1.5 text-[0.6875rem] font-heading font-semibold tracking-[0.18em] uppercase text-sidebar-primary mb-6">
                  Bar Management Platform
                </span>
                <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] tracking-tight mb-6">
                  The smarter way
                  <br />
                  <span className="text-sidebar-primary">to run your bar</span>
                </h1>
                <p className="text-base sm:text-lg text-sidebar-foreground/75 leading-relaxed mb-8 max-w-xl">
                  Real-time inventory, automated payroll, tip tracking, and supplier
                  management — built specifically for bar operators.
                </p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <a
                    href="#contact"
                    className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-lg bg-cta text-cta-foreground font-semibold text-base hover:brightness-95 transition-[filter] duration-200"
                  >
                    Request a Demo <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                  <DemoButton
                    size="lg"
                    className="border-sidebar-border !text-sidebar-foreground hover:!bg-sidebar-accent hover:!text-sidebar-foreground"
                  />
                </div>
                <p className="mt-4 text-xs text-sidebar-foreground/55 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Demo uses realistic sample data — no credit card required
                </p>
                {/* Marks where the hero CTA leaves the viewport; the sticky
                    mobile bar reveals itself past this point. */}
                <div id="sticky-cta-sentinel" aria-hidden className="h-px w-full" />
              </div>

              {/* Product motif: a miniature of the thing being sold. */}
              <div className="hidden lg:block" aria-hidden>
                <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-3 shadow-depth-xl backdrop-blur-sm">
                  <div className="flex items-center gap-1.5 px-1 pb-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-sidebar-foreground/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-sidebar-foreground/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-sidebar-foreground/20" />
                    <span className="ml-2 font-heading text-[0.625rem] tracking-widest uppercase text-sidebar-foreground/60">
                      Nightly close
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { k: 'Net sales',    v: '$8,412', d: '+6.2%' },
                      { k: 'Tip pool',     v: '$1,268', d: 'split 9 ways' },
                      { k: 'Low stock',    v: '4 items', d: 'reorder ready' },
                      { k: 'Variance',     v: '1.8%',   d: 'within par' },
                    ].map(({ k, v, d }) => (
                      <div key={k} className="rounded-lg bg-sidebar/70 border border-sidebar-border p-3">
                        <p className="font-heading text-[0.625rem] uppercase tracking-widest text-sidebar-foreground/45">{k}</p>
                        <p className="font-heading text-xl font-bold text-sidebar-foreground mt-1 tabular-nums">{v}</p>
                        <p className="text-[0.6875rem] text-sidebar-primary mt-0.5">{d}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 rounded-lg bg-sidebar/70 border border-sidebar-border p-3">
                    <p className="font-heading text-[0.625rem] uppercase tracking-widest text-sidebar-foreground/45 mb-2">
                      Pours vs. par — last 7 nights
                    </p>
                    <div className="flex items-end gap-1.5 h-16">
                      {[48, 62, 55, 78, 71, 92, 84].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm bg-sidebar-primary/70"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stat bar */}
          <div className="relative z-10 border-t border-sidebar-border">
            <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:divide-x divide-sidebar-border">
              {STATS.map(({ value, label }) => (
                <div key={label} className="sm:px-8 sm:first:pl-0">
                  <p className="font-heading text-2xl font-bold text-sidebar-primary tabular-nums">{value}</p>
                  <p className="text-xs text-sidebar-foreground/60 mt-1 leading-snug">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Demo disclaimer ────────────────────────────────────────────── */}
        <div className="bg-muted border-b border-border px-6 py-3 text-center">
          <p className="text-xs text-muted-foreground max-w-3xl mx-auto">
            {/* Explicit {' '}: the space after </strong> is swallowed when the
                sentence wraps to the next source line, rendering "accountscontain". */}
            <strong className="text-accent-text">Demo accounts</strong>{' '}
            contain pre-loaded sample data for &ldquo;The Tipsy Tavern&rdquo; — no real
            bar data is used or stored. Demo sessions may be cleared periodically.
          </p>
        </div>

        {/* ── Problem ────────────────────────────────────────────────────── */}
        <section className="py-20 sm:py-24 bg-background">
          <div className="max-w-6xl mx-auto px-6">
            <div className="max-w-2xl mb-12">
              <span className="eyebrow">The status quo</span>
              <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mt-3">
                Most bars run on memory and guesswork.
              </h2>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {PROBLEMS.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="rounded-xl border border-border bg-card p-5">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-accent-text mb-4">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="font-heading font-semibold text-base">{title}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ───────────────────────────────────────────────────── */}
        <section id="features" className="py-20 sm:py-24 bg-card border-y border-border scroll-mt-16">
          <div className="max-w-6xl mx-auto px-6">
            <div className="max-w-2xl mb-12">
              <span className="eyebrow">Everything you need</span>
              <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mt-3">
                One platform. All your operations.
              </h2>
              <p className="text-muted-foreground mt-4 leading-relaxed">
                Rail replaces the spreadsheets, whiteboards, and mental math that bar
                managers rely on today.
              </p>
            </div>
            <div className="grid gap-px bg-border border border-border rounded-xl overflow-hidden sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="bg-card p-6 transition-colors duration-200 hover:bg-muted/60"
                >
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="font-heading font-semibold text-base">{title}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ───────────────────────────────────────────────── */}
        <section id="how-it-works" className="py-20 sm:py-24 bg-background scroll-mt-16">
          <div className="max-w-5xl mx-auto px-6">
            <div className="max-w-2xl mb-12">
              <span className="eyebrow">Simple setup</span>
              <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mt-3">
                Up and running in minutes
              </h2>
            </div>
            <ol className="grid gap-8 md:grid-cols-3">
              {STEPS.map((step) => (
                <li key={step.n} className="border-t-2 border-primary pt-5">
                  <span className="font-heading text-sm font-bold text-primary tracking-widest tabular-nums">
                    {step.n}
                  </span>
                  <h3 className="font-heading font-semibold text-lg mt-2">{step.title}</h3>
                  <p className="text-muted-foreground text-sm mt-2 leading-relaxed">{step.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Bar types ──────────────────────────────────────────────────── */}
        <section className="py-14 bg-card border-y border-border">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-center eyebrow mb-7">Built for every type of venue</h2>
            <ul className="flex flex-wrap justify-center gap-2.5">
              {BAR_TYPES.map(({ label, icon: Icon }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium"
                >
                  <Icon className="h-4 w-4 text-primary shrink-0" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────────────────── */}
        <section id="faq" className="py-20 sm:py-24 bg-background scroll-mt-16">
          <div className="max-w-3xl mx-auto px-6">
            <div className="mb-10">
              <span className="eyebrow">Before you ask</span>
              <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mt-3">
                Common questions
              </h2>
            </div>
            <dl className="divide-y divide-border border-y border-border">
              {FAQS.map(({ q, a }) => (
                <div key={q} className="py-5">
                  <dt className="font-heading font-semibold text-base">{q}</dt>
                  <dd className="text-sm text-muted-foreground mt-2 leading-relaxed">{a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── CTA ────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-primary text-primary-foreground py-16">
          <div aria-hidden className="absolute inset-0 grid-texture text-primary-foreground opacity-30" />
          <div className="relative z-10 max-w-4xl mx-auto px-6 text-center space-y-6">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
              See Rail in action — right now
            </h2>
            <p className="text-primary-foreground/80 max-w-xl mx-auto">
              Launch a fully pre-loaded demo bar in seconds. No signup, no credit card,
              no commitment.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-1">
              <DemoButton
                size="lg"
                className="bg-cta !border-cta !text-cta-foreground hover:!bg-cta hover:brightness-95"
              />
              <a
                href="#contact"
                className="inline-flex items-center gap-1.5 text-primary-foreground/85 hover:text-primary-foreground font-medium transition-colors duration-200"
              >
                Or schedule a guided demo <ChevronRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
        </section>

        {/* ── Contact / Demo form ────────────────────────────────────────── */}
        <section id="contact" className="py-20 sm:py-24 bg-background scroll-mt-16">
          <div className="max-w-5xl mx-auto px-6">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.5fr] items-start">
              {/* Left: copy */}
              <div className="space-y-6 lg:sticky lg:top-24">
                <div>
                  <span className="eyebrow">Get in touch</span>
                  <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mt-3">
                    Ready to take back control of your bar?
                  </h2>
                  <p className="text-muted-foreground mt-4 leading-relaxed">
                    Fill out the form and a real person replies&nbsp;&mdash;{' '}
                    <strong className="text-foreground">within one business day</strong>, and
                    usually the same afternoon. No call centre, no drip sequence.
                  </p>
                </div>
                <ul className="space-y-2.5">
                  {[
                    'Free 30-minute personalised walkthrough',
                    'We import your existing inventory',
                    'No long-term contract required',
                    'Dedicated onboarding support',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                  <p className="font-heading font-semibold text-sm">Can&rsquo;t wait? Try the demo now.</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Explore a live demo bar with realistic data — no form needed.
                  </p>
                  <div className="pt-1.5"><DemoButton size="sm" /></div>
                  {/* The demo signs you straight in, so this is where the terms
                      are disclosed — there is no signup screen to put them on.
                      The acceptance is recorded server-side in /api/demo. */}
                  <p className="text-muted-foreground text-[0.6875rem] leading-relaxed pt-1">
                    Starting a demo means you accept our{' '}
                    <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
                      Terms
                    </Link>{' '}
                    and{' '}
                    <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </div>
              </div>
              {/* Right: form */}
              <div className="rounded-xl border border-border bg-card card-shadow-md p-6 sm:p-8">
                <h3 className="font-heading text-lg font-bold mb-6">Request a Demo</h3>
                <DemoRequestFormLazy />
              </div>
            </div>
          </div>
        </section>
      </main>

      <StickyCta />
      <BackToTop />

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      {/* Foot padding reserves the sticky bar's height on mobile so it never
          covers the last of the footer. */}
      <footer className="bg-sidebar text-sidebar-foreground py-12 pb-bottom-nav md:pb-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 mb-8">
            <div>
              <p className="font-heading font-bold text-lg tracking-[0.3em] uppercase">Rail</p>
              <p className="text-sidebar-foreground/60 text-sm mt-1">Bar Management Platform</p>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-sidebar-foreground/70">
              {NAV_LINKS.map(([label, href]) => (
                <a key={href} href={href} className="hover:text-sidebar-foreground transition-colors duration-200">
                  {label}
                </a>
              ))}
              <Link href="/privacy" className="hover:text-sidebar-foreground transition-colors duration-200">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-sidebar-foreground transition-colors duration-200">
                Terms
              </Link>
              <Link href="/eula" className="hover:text-sidebar-foreground transition-colors duration-200">
                Agent Licence
              </Link>
              <Link href="/accessibility" className="hover:text-sidebar-foreground transition-colors duration-200">
                Accessibility
              </Link>
              <Link href="/login" className="hover:text-sidebar-foreground transition-colors duration-200">
                Sign in
              </Link>
            </nav>
          </div>
          <div className="border-t border-sidebar-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-sidebar-foreground/60">
              &copy; {new Date().getFullYear()} Rail. All rights reserved.
            </p>
            <p className="text-xs text-sidebar-foreground/60">
              Built for bar operators. Not affiliated with any POS vendor.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
