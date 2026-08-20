'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// Mirrors the sidebar's Inventory group exactly. Previously this listed a
// /loss route that now just redirects to /app/inventory, and omitted Weigh.
// Setup sits before Analytics on purpose: it answers whether the numbers on
// Analytics can be trusted at all, and reading them in the other order means
// studying a report built on stock that never moved.
const TABS = [
  { label: 'Items',     href: '/app/inventory' },
  { label: 'Weigh',     href: '/app/inventory/weigh' },
  { label: 'Setup',     href: '/app/inventory/setup' },
  { label: 'Analytics', href: '/app/inventory/analytics' },
];

export function InventorySubNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Inventory sections"
      className="border-b border-border/60 bg-card"
    >
      <div className="flex px-5 overflow-x-auto">
        {TABS.map(({ label, href }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors duration-200',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
