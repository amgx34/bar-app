'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'Home', href: '/app/inventory' },
  { label: 'Loss', href: '/app/inventory/loss' },
  { label: 'Analytics', href: '/app/inventory/analytics' },
];

export function InventorySubNav() {
  const pathname = usePathname();
  return (
    <div className="border-b border-border/60 bg-card">
      <div className="flex px-5">
        {TABS.map(({ label, href }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-all duration-200',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
