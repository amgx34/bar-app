import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { findOwnedBar } from '@/lib/setup/owned-bar';
import { VerifyEmail } from './_components/verify-email';
import { SetupForm } from './_components/setup-form';

export default async function SetupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/setup');

  // Someone who already owns a bar has nothing to set up here.
  if (await findOwnedBar(user.id)) redirect('/app/dashboard');

  if (!user.email_confirmed_at) {
    return <VerifyEmail email={user.email ?? null} />;
  }

  return <SetupForm />;
}
