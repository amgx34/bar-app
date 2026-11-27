import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { SIGNUP_OPEN } from '@/lib/auth/signup-open';
import { isDemoEmail } from '@/lib/demo/write-guard';
import { SignupForm, SignupClosed } from './signup-form';

export const metadata: Metadata = {
  title: 'Create account',
  robots: { index: false, follow: true },
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  // A real signed-in user has nothing to sign up for; a demo visitor may.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && !isDemoEmail(user.email)) redirect('/app/dashboard');

  // Only a live demo session earns the carry-over line; the action re-checks it.
  const carry = (await searchParams).from === 'demo' && isDemoEmail(user?.email);

  return (
    <main className="relative min-h-dvh grid place-items-center p-6 overflow-hidden bg-sidebar text-sidebar-foreground">
      <div aria-hidden className="absolute inset-0 grid-texture text-sidebar-foreground opacity-40" />
      <div className="relative z-10 w-full flex flex-col items-center gap-6">
        <h1 className="sr-only">Create your Rail account</h1>
        <p aria-hidden="true" className="font-heading text-sidebar-foreground/60 text-xs font-bold tracking-[0.3em] uppercase select-none">Rail</p>
        {SIGNUP_OPEN ? <SignupForm fromDemo={carry} /> : <SignupClosed />}
        <Link href="/" className="flex min-h-11 items-center gap-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors duration-200">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to home
        </Link>
      </div>
    </main>
  );
}
