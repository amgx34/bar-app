import { User } from 'lucide-react';
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

type Props = {
  email: string;
  currentOrg: any; // your type
  role: any;
  allMemberships: any;
};

export function AppHeader({ email }: Props) {  // remove unused props if not needed here
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center border-b border-border/60 bg-card/95 backdrop-blur-sm px-6 gap-4">
      <SidebarTrigger />
      <div className="font-bold text-lg tracking-[0.2em] text-primary uppercase">
        Rail
      </div>
      <div className="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
          aria-label="Account menu"
        >
          <User className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
              Signed in as
            </DropdownMenuLabel>
            <DropdownMenuLabel className="pt-0 truncate text-sm font-medium">
              {email}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <form action={signOut}>
            <DropdownMenuItem>
              <button type="submit" className="w-full text-left">
                Log out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}