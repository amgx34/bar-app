'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { sidebarGroups } from './nav-config';
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
// Icons travel with the nav config now; only the disclosure arrow is local.
import { ChevronRight } from 'lucide-react';

// ── Nav structure ─────────────────────────────────────────────────────────────
//
// Read from nav-config rather than declared here. The sidebar, the mobile bar,
// the section tab strips and the breadcrumbs all derive from one structure, so
// a route cannot appear in one and be missing from another — which is how two
// different Inventory tab strips ended up rendering at once, and how /app/tax
// ended up with no link to it from anywhere.

type NavChild = { label: string; href: string };
type NavItem  = {
  label:    string;
  href:     string;
  icon:     React.ComponentType<{ className?: string }>;
  children?: NavChild[];
};

// ── Collapsible nav item ──────────────────────────────────────────────────────

function CollapsibleNavItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const isChildActive = item.children?.some(
    (c) => pathname === c.href || (c.href !== '/app/inventory' && pathname.startsWith(c.href + '/')),
  ) ?? false;
  const isSelfActive  = pathname === item.href;
  const hasChildren   = !!item.children?.length;

  // Seeded from the current route. AppSidebar keys this component on the
  // pathname, so every navigation re-seeds it — arriving at a child route
  // always reveals the group, while a manual collapse persists until you move.
  const [open, setOpen] = useState(isChildActive || isSelfActive);
  const Icon = item.icon;
  const submenuId = `nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`;

  if (!hasChildren) {
    return (
      <SidebarMenuItem>
        {/* `render` rather than wrapping in <Link> — wrapping produces
            <a><button>, which is invalid and gives keyboard users two
            overlapping stops. Matches the sub-items below. */}
        <SidebarMenuButton
          render={<Link href={item.href} />}
          isActive={isSelfActive || isChildActive}
          className="flex items-center gap-3"
        >
          <Icon className="h-4 w-4" />
          <span>{item.label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isSelfActive || isChildActive}
        className="flex items-center gap-3 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={submenuId}
      >
        <Icon className="h-4 w-4" />
        <span>{item.label}</span>
        <ChevronRight
          aria-hidden
          className={cn(
            'ml-auto h-3.5 w-3.5 opacity-60 transition-transform duration-200',
            open && 'rotate-90',
          )}
        />
      </SidebarMenuButton>

      {open && (
        <SidebarMenuSub id={submenuId}>
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
  const groups = sidebarGroups();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="border-b border-border" />

      <SidebarContent>
        {groups.map(({ group, items }, groupIndex) => (
          <Fragment key={group}>
            {groupIndex > 0 && <SidebarSeparator />}

            <SidebarGroup>
              {/* Named for the job, not the data model. The previous "Menu" and
                  "More" split filed Payroll — the most-used screen after the
                  dashboard — under "More". */}
              <SidebarGroupLabel>{group}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((section) => {
                    const item: NavItem = {
                      label: section.root.label,
                      href: section.root.href,
                      icon: section.root.icon,
                      children: section.tabs?.map((t) => ({ label: t.label, href: t.href })),
                    };

                    return (
                      // Keyed on pathname so the open state re-seeds from the
                      // route on every navigation, rather than freezing at
                      // first mount.
                      <CollapsibleNavItem
                        key={`${item.href}:${pathname}`}
                        item={item}
                        pathname={pathname}
                      />
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </Fragment>
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
