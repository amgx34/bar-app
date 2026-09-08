import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getEmployeeAccountState } from '@/lib/employee-portal/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Waiting for approval' };

/**
 * What somebody sees between signing up and being let in.
 *
 * Says nothing a stranger should not learn: no bar name, no roster, no figures,
 * and no confirmation that the name they typed matched anybody. Somebody who
 * guessed a join code and a name learns exactly as much as somebody who did
 * not — which is what makes the same-response rule in the claim action hold all
 * the way through the UI.
 */
export default async function PendingPage() {
  const state = await getEmployeeAccountState();

  // Approved between page loads — send them to the thing they came for.
  if (state.kind === 'active') redirect('/me');
  // A revoked account is 'none', and gets the same treatment as a stranger.
  if (state.kind === 'none') redirect('/login');

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="rounded-xl border p-6">
        <h1 className="text-lg font-semibold">Waiting for approval</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your manager needs to approve your account before you can see your
          hours and pay. Ask them to check the Employees screen.
        </p>
      </div>
    </main>
  );
}
