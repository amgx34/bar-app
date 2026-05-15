'use client';

import { useState } from 'react';
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import {
  Home, Package, CircleDollarSign, User, Receipt,
  Settings, BookOpen, Users, ChevronRight,
} from 'lucide-react';

// ── Nav structure ─────────────────────────────────────────────────────────────

type NavChild = { label: string; href: string };
type NavItem  = {
  label:    string;
  href:     string;
  icon:     React.ComponentType<{ className?: string }>;
  children?: NavChild[];
};

const PRIMARY: NavItem[] = [
  { label: 'Dashboard', href: '/app/dashboard', icon: Home },
  {
    label: 'Inventory', href: '/app/inventory', icon: Package,
    children: [
      { label: 'Items',      href: '/app/inventory' },
      { label: 'Weigh',      href: '/app/inventory/weigh' },
      { label: 'Analytics',  href: '/app/inventory/analytics' },
    ],
  },
  { label: 'Reps',  href: '/app/reps',  icon: Users },
  { label: 'Books', href: '/app/books', icon: BookOpen },
];

const SECONDARY: NavItem[] = [
  { label: 'Payroll',   href: '/app/payroll',   icon: CircleDollarSign },
  { label: 'Employees', href: '/app/employees', icon: User },
  { label: 'Tips',      href: '/app/tips',      icon: Receipt },
  { label: 'Settings',  href: '/app/settings',  icon: Settings },
];

// ── Collapsible nav item ──────────────────────────────────────────────────────

function CollapsibleNavItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const isChildActive = item.children?.some(
    (c) => pathname === c.href || (c.href !== '/app/inventory' && pathname.startsWith(c.href + '/')),
  ) ?? false;
  const isSelfActive  = pathname === item.href;
  const hasChildren   = !!item.children?.length;

  const [open, setOpen] = useState(isChildActive || isSelfActive);
  const Icon = item.icon;

  if (!hasChildren) {
    return (
      <SidebarMenuItem>
        <Link href={item.href}>
          <SidebarMenuButton
            isActive={isSelfActive || isChildActive}
            className="flex items-center gap-3"
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </SidebarMenuButton>
        </Link>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isSelfActive || isChildActive}
        className="flex items-center gap-3 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon className="h-4 w-4" />
        <span>{item.label}</span>
        <ChevronRight
          className={cn(
            'ml-auto h-3.5 w-3.5 opacity-60 transition-transform duration-200',
            open && 'rotate-90',
          )}
        />
      </SidebarMenuButton>

      {open && (
        <SidebarMenuSub>
          {item.children!.map((child) => {
            const childActive =
              pathname === child.href ||
              (child.href !== '/app/inventory' && pathname.startsWith(child.href + '/'));
            return (
              <SidebarMenuSubItem key={child.href}>
                <SidebarMenuSubButton
                  render={<Link href={child.href} />}
                  isActive={childActive}
                >
                  {child.label}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="border-b border-border" />

      <SidebarContent>
        {/* Primary navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PRIMARY.map((item) => (
                <CollapsibleNavItem key={item.href} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Secondary navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>More</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {SECONDARY.map(({ label, href, icon: Icon }) => {
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

      <SidebarRail />
    </Sidebar>
  );
}
