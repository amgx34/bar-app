import { getEmployeeAccountState } from '@/lib/employee-portal/session';
import { signOut } from '@/app/(app)/app/actions';

/**
 * The portal's chrome: a name and a way out, and nothing else.
 *
 * No navigation on purpose. Everything an employee can see is on one page, and
 * a nav bar here would be a set of links into a manager app they have no
 * business reaching — the redirect in lib/org.ts already sends them back, but
 * the honest design is not to offer the door.
 *
 * Reads the account state rather than getCurrentEmployee(), so the pending
 * screen underneath can render its own message instead of being redirected
 * away by its own layout.
 */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const state = await getEmployeeAccountState();
  const name = state.kind === 'active' ? state.session.employeeName : null;

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="font-heading text-[11px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
              Rail
            </p>
            {name && <p className="truncate text-sm font-medium">{name}</p>}
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
