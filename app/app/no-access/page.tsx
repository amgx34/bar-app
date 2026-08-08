import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
        <h1 className="text-2xl font-semibold">Your account isn&apos;t linked to a bar yet</h1>
        <p className="text-muted-foreground">
          Signed in as <span className="font-medium">{user.email}</span>. If you just
          purchased the service, your account will be set up shortly. Otherwise, please
          contact support.
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" render={<Link href="mailto:support@yourdomain.com" />}>
            Contact support
          </Button>
          <form action={signOut}>
            <Button type="submit" variant="ghost">Log out</Button>
          </form>
        </div>
      </div>
    </main>
  );
}
