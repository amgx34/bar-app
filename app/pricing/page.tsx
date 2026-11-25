import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Pricing',
  description: `${SITE_NAME} is one flat monthly price per bar. No per-employee fee, no setup fee for the first bars.`,
  alternates: { canonical: '/pricing' },
};

// Display labels come from env so the page never states a price Stripe does not charge.
const PLANS = [
  { name: 'Close', price: process.env.NEXT_PUBLIC_PRICE_LABEL_CLOSE,
    blurb: 'Reads the night’s Z report from your 2Touch POS and works out the tip split and pay run for you to check and approve.' },
  { name: 'Whole bar', price: process.env.NEXT_PUBLIC_PRICE_LABEL_WHOLE_BAR,
    blurb: 'Everything in Close, plus stock that moves with POS sales, delivery costs from the invoice, a books view, and orders to supplier reps by email or text.' },
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 text-foreground">
      <Link href="/" className="text-sm underline underline-offset-2">Back to {SITE_NAME}</Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Pricing</h1>
      <p className="mt-2 text-muted-foreground">One flat price per bar, per month. Month to month. Pay by card or Link through Stripe.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {PLANS.map((p) => (
          <section key={p.name} className="rounded-xl border bg-card p-6">
            <h2 className="text-xl font-semibold">{p.name}</h2>
            <p className="mt-1 text-2xl font-bold">{p.price ?? 'Ask us'}{p.price && <span className="text-sm font-normal text-muted-foreground"> a bar a month</span>}</p>
            <p className="mt-3 text-sm text-muted-foreground">{p.blurb}</p>
          </section>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        {SITE_NAME} does not file taxes, withhold taxes, or hold or move your money.
        Sign up, then subscribe from Settings, Billing. You can cancel any time from the same screen.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/signup" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground">Create an account to subscribe</Link>
        <Link href="/login" className="inline-flex min-h-11 items-center rounded-lg border px-5 font-medium">Sign in</Link>
        <Link href="/#contact" className="inline-flex min-h-11 items-center rounded-lg border px-5 font-medium">Book a demo</Link>
      </div>
    </main>
  );
}
