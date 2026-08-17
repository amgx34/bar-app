import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, ArrowLeft, Clock, Mail } from 'lucide-react';
import { DemoButton } from '@/app/_components/landing/demo-button';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Request received',
  description: `Your ${SITE_NAME} demo request has been received. We reply within one business day.`,
  // A real URL so the submission is measurable as a conversion, but there is
  // nothing here worth ranking and it is meaningless without the form before it.
  robots: { index: false, follow: true },
};

/** What happens next, in the order it happens. */
const STEPS = [
  {
    icon: Mail,
    title: 'We read it today',
    body: 'Your request goes straight to the team — not a queue or an autoresponder.',
  },
  {
    icon: Clock,
    title: 'We reply within one business day',
    body: 'If you sent it over a weekend, expect to hear from us Monday morning.',
  },
  {
    icon: CheckCircle2,
    title: 'We book a 30-minute walkthrough',
    body: 'Screen share, your questions, your numbers. No slide deck and no commitment.',
  },
];

export default function ThankYouPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl">
          <div className="flex items-center gap-3 mb-6">
            <span className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-6 w-6" aria-hidden />
            </span>
            <span className="eyebrow">Request received</span>
          </div>

          <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
            Thanks — we&rsquo;ve got it.
          </h1>
          <p className="text-muted-foreground mt-4 leading-relaxed">
            Someone from {SITE_NAME} will be in touch within one business day. If it is
            urgent, reply to the confirmation email and it will jump the queue.
          </p>

          <ol className="mt-10 space-y-px bg-border border border-border rounded-xl overflow-hidden">
            {STEPS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="bg-card p-5 flex gap-4">
                <span className="h-9 w-9 rounded-lg bg-muted text-primary flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span>
                  <span className="block font-heading font-semibold text-sm">{title}</span>
                  <span className="block text-sm text-muted-foreground mt-1 leading-relaxed">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-10 rounded-xl border border-border bg-card p-5">
            <p className="font-heading font-semibold text-sm">
              Don&rsquo;t want to wait?
            </p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Open a demo bar loaded with realistic data and click around right now.
            </p>
            <div className="mt-4">
              <DemoButton />
            </div>
          </div>

          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors duration-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back to the site
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
