import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ScrollText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasAcceptedCurrentTerms } from '@/lib/terms';
import { TERMS_VERSION } from '@/lib/legal';
import { SITE_NAME } from '@/lib/site';
import { AcceptTermsForm } from './_components/accept-terms-form';

export const metadata: Metadata = { title: 'Accept the Terms' };

/**
 * Consent gate for people who never went through /setup — teammates an owner
 * provisioned, and everyone with an existing account the first time a new
 * version of the terms is published.
 *
 * Lives outside app/(app)/app so that the layout gate which sends users here
 * cannot send them here again in a loop.
 */
export default async function AcceptTermsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts only guards /app/*, so this route authenticates itself.
  if (!user) redirect('/login?next=/accept-terms');

  const params = await searchParams;
  const next = params.next ?? '/app/dashboard';

  // Arriving here after accepting — a stale tab, or the back button. Send them
  // on rather than asking twice.
  if (await hasAcceptedCurrentTerms(user.id)) redirect(next);

  return (
    <main className="min-h-dvh bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-primary/10 p-2 text-primary">
              <ScrollText className="h-5 w-5" aria-hidden />
            </span>
            <h1 className="font-heading text-xl font-bold tracking-tight">
              Before you continue
            </h1>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            {SITE_NAME} handles payroll, tip allocation and bank details, so we need
            your agreement to the terms before you use it. This takes one click, and
            we record which version you accepted.
          </p>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Worth knowing up front: {SITE_NAME} calculates pay, it does not file your
            taxes or move your money. You stay responsible for checking a pay run
            before you send it.
          </p>

          <div className="mt-5 flex flex-wrap gap-4 text-sm">
            <Link
              href="/terms"
              target="_blank"
              rel="noopener"
              className="text-primary underline underline-offset-2"
            >
              Read the Terms of Service
            </Link>
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener"
              className="text-primary underline underline-offset-2"
            >
              Read the Privacy Policy
            </Link>
          </div>

          <AcceptTermsForm next={next} version={TERMS_VERSION} />
        </div>
      </div>
    </main>
  );
}
