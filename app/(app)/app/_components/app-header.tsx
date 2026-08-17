import { User, Wifi } from 'lucide-react';
import { signOut } from '../actions';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { NotificationBell } from './notification-bell';

const POS_LABELS: Record<string, string> = {
  clover:  'Clover',
  toast:   'Toast',
  '2touch':'2Touch',
};

type Props = {
  email:       string;
  posProvider?: string | null;
  orgName?:    string;
  orgSlug:     string;
};

export function AppHeader({ email, posProvider, orgName, orgSlug }: Props) {
  const hasPOS = !!posProvider;

  return (
    <header className="sticky top-0 z-nav flex h-14 items-center border-b border-border/60 bg-card/95 backdrop-blur-sm px-3 sm:px-6 gap-3">
      <SidebarTrigger className="shrink-0" />

      <span className="font-bold text-base sm:text-lg tracking-[0.2em] text-primary uppercase select-none">
        Rail
      </span>

      {/* Which bar you are editing. Rail is multi-tenant, so this must be
          visible on phones too — it previously hid behind an `xs:` breakpoint
          that Tailwind v4 does not define here, so it never rendered at all. */}
      {orgName && (
        <span className="text-sm text-muted-foreground truncate max-w-[8rem] sm:max-w-[14rem]">
          {orgName}
        </span>
      )}

      <div className="flex-1" />

      {/* POS status.
          One element at both sizes: the label is the accessible name, so status
          never depends on a `title` tooltip (unavailable on touch, unreliably
          announced) or on colour alone. The dot is decorative reinforcement. */}
      {hasPOS && (
        <p className="flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2 sm:px-2.5 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="sr-only">POS connected: </span>
          {POS_LABELS[posProvider!] ?? posProvider}
        </p>
      )}

      <ThemeToggle />

      {/* Notification bell */}
      <NotificationBell orgSlug={orgSlug} />

      {/* Account dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'shrink-0')}
          aria-label="Account menu"
        >
          <User className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            {orgName && (
              <DropdownMenuLabel className="font-normal text-xs text-muted-foreground truncate">
                {orgName}
              </DropdownMenuLabel>
            )}
            <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
              Signed in as
            </DropdownMenuLabel>
            <DropdownMenuLabel className="pt-0 truncate text-sm font-medium">
              {email}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {/* The form is the wrapper and the menu item *is* the submit control —
              nesting a <button> inside the menu item gave two nested stops. */}
          <form action={signOut}>
            {/* nativeButton tells Base UI the rendered element is a real
                <button>, so it skips the role/aria-disabled shims it adds to
                fake buttons. Without it Base UI warns, and the item ends up
                carrying attributes a native button already implies. */}
            <DropdownMenuItem
              nativeButton
              render={<button type="submit" />}
              className="w-full text-left"
            >
              Log out
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
