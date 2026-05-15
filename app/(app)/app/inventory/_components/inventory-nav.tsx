'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Scale, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

const NAV_ITEMS = [
  { label: 'Items',     href: '/app/inventory',                  icon: Home },
  { label: 'Weigh',     href: '/app/inventory/weigh',            icon: Scale },
  { label: 'Analytics', href: '/app/inventory/analytics',        icon: TrendingUp },
];

export function InventoryNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-0">
      {NAV_ITEMS.map((item, index) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;

        return (
          <div key={item.href} className="flex items-center gap-0">
            <Link
              href={item.href}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
            {index < NAV_ITEMS.length - 1 && (
              <Separator orientation="vertical" className="h-6 bg-white" />
            )}
          </div>
        );
      })}
    </div>
  );
}
