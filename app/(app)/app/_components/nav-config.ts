import {
  Home, Package, CircleDollarSign, Receipt, Settings, BookOpen, Users,
  Scale, ClipboardCheck, TrendingUp, CalendarRange, UserCog, Landmark, Layers,
  Banknote, FileCheck2,
} from 'lucide-react';

/**
 * One description of the app's navigation, read by every surface that draws it.
 *
 * WHY THIS FILE EXISTS
 *
 * Navigation was previously declared four times — the desktop sidebar, the
 * mobile bottom bar, an inventory tab strip in the layout, and a second
 * inventory tab strip inside two of the pages. They disagreed: the layout strip
 * listed Setup, the in-page strip did not, and both rendered at once on
 * /app/inventory. Meanwhile /app/tax and /app/payroll/review existed with no
 * link to them from anywhere.
 *
 * Every surface now derives from SECTIONS, so a route added here appears in the
 * sidebar, the tab strip and the breadcrumb trail together, or not at all.
 *
 * GROUPED BY INTENT
 *
 * A bar operator does four jobs: run tonight, manage stock, pay people, and
 * understand the money. The old grouping was "Menu" and "More", which filed
 * Payroll — the single most-used screen after Dashboard — under "More".
 */

export type NavIcon = React.ComponentType<{ className?: string }>;

export type NavLink = {
  label: string;
  href: string;
  icon: NavIcon;
  /** Longer label for the breadcrumb trail, where context is thinner. */
  breadcrumb?: string;
};

export type NavSection = {
  /** Intent, not data model. Shown as the sidebar group heading. */
  group: string;
  /** The section's own landing route, and its entry in the sidebar. */
  root: NavLink;
  /**
   * Local tabs for this section. The first entry MUST be the root route, so the
   * strip and the section landing page agree on where "here" is.
   */
  tabs?: NavLink[];
};

export const SECTIONS: NavSection[] = [
  {
    group: 'Overview',
    root: { label: 'Dashboard', href: '/app/dashboard', icon: Home },
  },
  {
    group: 'Stock',
    root: { label: 'Inventory', href: '/app/inventory', icon: Package },
    tabs: [
      { label: 'Items',     href: '/app/inventory',           icon: Package },
      { label: 'Weigh',     href: '/app/inventory/weigh',     icon: Scale },
      // Before Analytics deliberately: it decides whether the numbers there can
      // be trusted, and reading them the other way round means studying a
      // report built on stock that never moved.
      { label: 'Setup',     href: '/app/inventory/setup',     icon: ClipboardCheck },
      { label: 'Analytics', href: '/app/inventory/analytics', icon: TrendingUp },
    ],
  },
  {
    group: 'People & Pay',
    root: { label: 'Payroll', href: '/app/payroll', icon: CircleDollarSign },
    tabs: [
      { label: 'Pay Run',        href: '/app/payroll',                 icon: CircleDollarSign },
      { label: 'Day Split',      href: '/app/payroll/split',           icon: CalendarRange },
      { label: 'Employees',      href: '/app/payroll/employees',       icon: UserCog },
      { label: 'Direct Deposit', href: '/app/payroll/direct-deposit',  icon: Banknote },
      // Previously reachable only from a button on the pay run.
      { label: 'Review',         href: '/app/payroll/review',          icon: FileCheck2 },
    ],
  },
  {
    group: 'Money',
    root: { label: 'Sales', href: '/app/sales', icon: TrendingUp },
    tabs: [
      { label: 'Overview',   href: '/app/sales',            icon: TrendingUp },
      { label: 'Categories', href: '/app/sales/categories', icon: Layers },
      { label: 'Margins',    href: '/app/sales/margins',    icon: Scale },
    ],
  },
  {
    group: 'Money',
    root: { label: 'Books', href: '/app/books', icon: BookOpen },
  },
  {
    group: 'Money',
    root: { label: 'Tips', href: '/app/tips', icon: Receipt },
  },
  {
    // Had no route into it from anywhere in the app before now.
    group: 'Money',
    root: { label: 'Tax', href: '/app/tax', icon: Landmark },
  },
  {
    group: 'Ordering',
    root: { label: 'Reps', href: '/app/reps', icon: Users },
  },
  {
    group: 'Setup',
    root: { label: 'Settings', href: '/app/settings', icon: Settings },
  },
];

/** Sidebar groups, in order, with their links — derived so it cannot drift. */
export function sidebarGroups(): { group: string; items: NavSection[] }[] {
  const order: string[] = [];
  const byGroup = new Map<string, NavSection[]>();

  for (const section of SECTIONS) {
    if (!byGroup.has(section.group)) {
      byGroup.set(section.group, []);
      order.push(section.group);
    }
    byGroup.get(section.group)!.push(section);
  }

  return order.map((group) => ({ group, items: byGroup.get(group)! }));
}

/**
 * The five destinations on the mobile bar.
 *
 * Five is the ceiling before targets get too narrow to hit on a phone. Reps was
 * dropped rather than Money because ordering is a weekly task and the money
 * screens are daily — and everything omitted here is one tap away under More,
 * which is what stops the phone reaching only half the app.
 */
export const MOBILE_PRIMARY: NavLink[] = [
  { label: 'Home',      href: '/app/dashboard', icon: Home },
  { label: 'Inventory', href: '/app/inventory', icon: Package },
  { label: 'Payroll',   href: '/app/payroll',   icon: CircleDollarSign },
  { label: 'Books',     href: '/app/books',     icon: BookOpen },
];

/** Everything not on the mobile bar, for the More drawer. */
export function mobileOverflow(): NavLink[] {
  const primary = new Set(MOBILE_PRIMARY.map((i) => i.href));
  return SECTIONS.map((s) => s.root).filter((r) => !primary.has(r.href));
}

/**
 * Whether a nav link should read as current.
 *
 * Exact match for a section root, prefix match for its children — but a root
 * that is also the first tab (Inventory, Payroll) must not stay highlighted on
 * every child route, or the strip shows two active tabs at once.
 */
export function isActive(href: string, pathname: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

/** The section a route belongs to, or null for routes outside the nav. */
export function sectionFor(pathname: string): NavSection | null {
  // Longest root first, so /app/inventory/setup matches Inventory rather than
  // an unrelated shorter prefix.
  const candidates = [...SECTIONS].sort((a, b) => b.root.href.length - a.root.href.length);
  return candidates.find((s) => isActive(s.root.href, pathname)) ?? null;
}

/**
 * Breadcrumb trail for a route, or an empty array when it is top level.
 *
 * Top-level pages get no crumbs: a single "Dashboard" crumb above a page titled
 * Dashboard is noise, and noise is what teaches people to stop reading them.
 */
export function breadcrumbsFor(pathname: string): NavLink[] {
  const section = sectionFor(pathname);
  if (!section) return [];

  const tab = section.tabs?.find((t) => t.href !== section.root.href && isActive(t.href, pathname));
  if (!tab) return [];

  return [section.root, tab];
}
