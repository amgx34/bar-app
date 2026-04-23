import Link from 'next/link';
import { User } from 'lucide-react';
import { signOut } from '../actions';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import type { CurrentOrgResult } from '@/lib/org';
import { OrgSwitcher } from './org-switcher';
import { Badge } from '@/components/ui/badge';
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
  currentOrg: CurrentOrgResult['org'];
  role: CurrentOrgResult['role'];
  allMemberships: CurrentOrgResult['allMemberships'];
};

export function AppHeader({ email, currentOrg, role, allMemberships }: Props) {
  return (
    <header className="border-b">
      <div className="flex h-14 items-center px-4 gap-4">
        <Link href="/app" className="font-semibold shrink-0">Bar Inventory</Link>

        <OrgSwitcher currentOrg={currentOrg} allMemberships={allMemberships} />
        <Badge variant="secondary" className="capitalize hidden sm:inline-flex">
          {role}
        </Badge>

        <nav className="flex-1 flex gap-4 text-sm text-muted-foreground justify-end">
          <Link href="/app/dashboard" className="hover:text-foreground">Dashboard</Link>
          <Link href="/app/inventory" className="hover:text-foreground">Inventory</Link>
          <Link href="/app/reports" className="hover:text-foreground">Reports</Link>
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
            aria-label="Account menu"
          >
            <User className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
                Signed in as
              </DropdownMenuLabel>
              <DropdownMenuLabel className="pt-0 truncate max-w-[240px]">
                {email}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <form action={signOut}>
              <DropdownMenuItem nativeButton render={<button type="submit" className="w-full text-left" />}>
                Log out
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
