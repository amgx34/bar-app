'use client';

import { useTransition } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { toast } from 'sonner';
import { switchOrg } from '../actions';
import type { CurrentOrgResult } from '@/lib/org';
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
  currentOrg: CurrentOrgResult['org'];
  allMemberships: CurrentOrgResult['allMemberships'];
};

export function OrgSwitcher({ currentOrg, allMemberships }: Props) {
  const [isPending, startTransition] = useTransition();

  if (allMemberships.length <= 1) {
    return (
      <span className="font-medium text-sm truncate max-w-[200px]">
        {currentOrg.name}
      </span>
    );
  }

  function handleSwitch(orgId: string) {
    if (orgId === currentOrg.id) return;
    startTransition(async () => {
      try {
        await switchOrg(orgId);
        toast.success('Switched bar');
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to switch');
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-2')}
        disabled={isPending}
      >
        <span className="truncate max-w-[160px]">{currentOrg.name}</span>
        <ChevronsUpDown className="h-3 w-3 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Your bars
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {allMemberships.map((m) => (
          <DropdownMenuItem
            key={m.organization_id}
            onClick={() => handleSwitch(m.organization_id)}
            className="cursor-pointer"
          >
            <Check
              className={cn(
                'h-4 w-4 mr-2',
                m.organization_id === currentOrg.id ? 'opacity-100' : 'opacity-0'
              )}
            />
            <span className="flex-1 truncate">{m.organizations.name}</span>
            <span className="text-xs text-muted-foreground capitalize ml-2">
              {m.role}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
