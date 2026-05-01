'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV = [
  { label: 'Dashboard', href: '/app/dashboard' },
  { label: 'Inventory', href: '/app/inventory' },
  { label: 'Payroll', href: '/app/payroll' },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-2">
      {NAV.map(({ label, href }) => {
        const active =
          pathname === href ||
          (href !== '/app/dashboard' && pathname.startsWith(href + '/'));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'border border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
