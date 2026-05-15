import { User, Wifi } from 'lucide-react';
import { signOut } from '../actions';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const POS_LABELS: Record<string, string> = {
  clover:  'Clover',
  toast:   'Toast',
  '2touch':'2Touch',
};

type Props = {
  email:      string;
  posProvider?: string | null;
  orgName?:   string;
};

export function AppHeader({ email, posProvider, orgName }: Props) {
  const hasPOS = !!posProvider;

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center border-b border-border/60 bg-card/95 backdrop-blur-sm px-3 sm:px-6 gap-3">
      {/* Sidebar trigger — visible on all breakpoints */}
      <SidebarTrigger className="shrink-0" />

      {/* Brand wordmark */}
      <span className="font-bold text-base sm:text-lg tracking-[0.2em] text-primary uppercase select-none">
        Rail
      </span>

      {/* Org name — shows on mobile when sidebar is hidden */}
      {orgName && (
        <span className="hidden xs:block sm:hidden text-sm text-muted-foreground truncate max-w-[120px]">
          {orgName}
        </span>
      )}

      <div className="flex-1" />

      {/* POS integration status badge */}
      {hasPOS && (
        <div
          className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
          title={`Connected to ${POS_LABELS[posProvider!] ?? posProvider}`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {POS_LABELS[posProvider!] ?? posProvider}
        </div>
      )}

      {/* POS status — compact for mobile */}
      {hasPOS && (
        <div
          className="sm:hidden flex items-center"
          title={`Connected to ${POS_LABELS[posProvider!] ?? posProvider}`}
        >
          <Wifi className="h-4 w-4 text-emerald-500" />
        </div>
      )}

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
          <DropdownMenuItem>
            <form action={signOut} className="w-full">
              <button type="submit" className="w-full text-left">
                Log out
              </button>
            </form>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
