'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Home, Package, CircleDollarSign, User, Receipt } from 'lucide-react'; // add more icons as needed
import { OrgSwitcher } from './org-switcher'; // your existing component

const NAV = [
  { label: 'Dashboard', href: '/app/dashboard', icon: Home },
  { label: 'Inventory', href: '/app/inventory', icon: Package },
  { label: 'Payroll', href: '/app/payroll', icon: CircleDollarSign },
  { label: 'Employees', href: '/app/employees', icon: User },
  { label: 'Tips', href: '/app/tips', icon: Receipt },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="inset"> {/* "icon" = collapses to icons only */}
      <SidebarHeader className="border-b border-border">
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ label, href, icon: Icon }) => {
                const isActive =
                  pathname === href ||
                  (href !== '/app/dashboard' && pathname.startsWith(href + '/'));

                return (
                  <SidebarMenuItem key={href}>
                    <Link href={href}>
                      <SidebarMenuButton isActive={isActive} className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail /> {/* Optional resize handle */}
    </Sidebar>
  );
}