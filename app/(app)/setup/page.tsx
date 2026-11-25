import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { findOwnedBar } from '@/lib/setup/owned-bar';
import { SetupForm } from './_components/setup-form';

export default async function SetupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/setup');

  // Someone who already owns a bar has nothing to set up here.
  if (await findOwnedBar(user.id)) redirect('/app/dashboard');

  if (!user.email_confirmed_at) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 bg-sidebar text-sidebar-foreground">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center space-y-3">
          <h1 className="text-xl font-bold text-white">Verify your email first</h1>
          <p className="text-sm text-white/70">
            We need to confirm {user.email ?? 'your address'} before you can create a bar. Open the link in the email we sent, then come back here.
          </p>
          <Link href="/login" className="inline-block text-sm text-white underline underline-offset-2">Back to sign in</Link>
        </div>
      </main>
    );
  }

  return <SetupForm />;
}
