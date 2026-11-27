import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { isDemoEmail } from '@/lib/demo/write-guard';
import { SUPPORT_EMAIL } from '@/lib/support';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { signOut } from '../../(app)/app/actions';

export const metadata: Metadata = { title: 'No access' };

export default async function NoAccessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold">This login is not connected to a bar</h1>
        {!isDemoEmail(user.email) && (
          <p className="text-muted-foreground break-words">
            You are signed in as <span className="font-medium text-foreground">{user.email}</span>.
          </p>
        )}
        <p className="text-muted-foreground">
          If you work at a bar, ask the owner or a manager to add you, or request access with your bar&apos;s code.
          If you own the bar, email us and we will help.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <a href={`mailto:${SUPPORT_EMAIL}?subject=Help getting into Rail`} className={buttonVariants({ className: 'h-11 px-4' })}>
            Email support
          </a>
          <Link href="/join" className={buttonVariants({ variant: 'outline', className: 'h-11 px-4' })}>
            Staff sign-up
          </Link>
          <form action={signOut}>
            <Button type="submit" variant="ghost" className="h-11 w-full px-4">Log out</Button>
          </form>
        </div>
        <p className="text-sm text-muted-foreground break-all">Support: {SUPPORT_EMAIL}</p>
      </div>
    </main>
  );
}
