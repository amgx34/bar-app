'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import { payRunHref } from '@/lib/date-range';

/**
 * "Run Payroll", pointed at the week you are actually looking at.
 *
 * It used to be a bare link to the review screen, which defaults to the current
 * pay week. So the Pay Run could browse back through previous weeks — the
 * arrows and the date form both worked — but the button that runs one always
 * snapped to today's week, and the CSV came out named for it. A bar could look
 * at a past week and never pay it.
 *
 * The link is rendered from the Payroll layout, which sits above every tab and
 * cannot read searchParams, so the week is read on the client instead. Where
 * there is no week in the URL — Employees, Direct Deposit — it stays a bare
 * path and the review screen picks its own default, which is right there.
 */
const LINK_CLASS =
  'inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold ' +
  'text-primary-foreground shadow-sm transition-colors hover:bg-primary/90';

function RunPayrollLinkView({ href }: { href: string }) {
  return (
    <Link href={href} className={LINK_CLASS}>
      <ClipboardCheck className="h-4 w-4" aria-hidden />
      Run Payroll
    </Link>
  );
}

/**
 * What renders while the search params are unknown.
 *
 * Prerendering cannot know the query string, so without this the whole button
 * disappears from the initial HTML. The bare path is the correct destination
 * for anyone who lands before hydration: it runs the current week, which is
 * what the button did for its entire life before this change.
 */
export function RunPayrollLinkFallback() {
  return <RunPayrollLinkView href="/app/payroll/review" />;
}

export function RunPayrollLink() {
  const searchParams = useSearchParams();
  const href = payRunHref(
    '/app/payroll/review',
    searchParams.get('startDate'),
    searchParams.get('endDate'),
  );
  return <RunPayrollLinkView href={href} />;
}
