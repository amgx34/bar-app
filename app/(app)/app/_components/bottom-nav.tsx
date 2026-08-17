'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Package, CircleDollarSign, Users, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

// Top-level destinations only — every entry is a section root that also appears
// at the top level of the sidebar, so the two navs model the same hierarchy.
// Previously slot 3 was /app/inventory/analytics, a *child* of Inventory sitting
// beside four section roots; Payroll takes it, since Payroll was otherwise
// reachable on a phone only by opening the sidebar sheet.
const ITEMS = [
  { label: 'Home',      href: '/app/dashboard', icon: Home },
  { label: 'Inventory', href: '/app/inventory', icon: Package },
  { label: 'Payroll',   href: '/app/payroll',   icon: CircleDollarSign },
  { label: 'Reps',      href: '/app/reps',      icon: Users },
  { label: 'Books',     href: '/app/books',     icon: BookOpen },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed bottom-0 left-0 right-0 z-nav md:hidden',
        'bg-card/95 backdrop-blur-md border-t border-border',
        'shadow-[0_-2px_16px_rgba(0,0,0,0.07)]',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-16 px-1">
        {ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive =
            pathname === href ||
            (href !== '/app/dashboard' && pathname.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-0.5 flex-1 py-1.5 px-1 rounded-xl transition-all duration-150 active:scale-95',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <div
                className={cn(
                  'p-1.5 rounded-xl transition-all duration-150',
                  isActive ? 'bg-primary/12 scale-110' : '',
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={cn(
                'text-[10px] font-medium leading-none transition-all',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
