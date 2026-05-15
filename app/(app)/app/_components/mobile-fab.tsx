'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Package, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTIONS = [
  { label: 'Adjust Stock', href: '/app/inventory', icon: Package,  color: 'bg-primary text-primary-foreground' },
  { label: 'New Rep Order', href: '/app/reps',     icon: Users,    color: 'bg-amber-500 text-white' },
  { label: 'Settings',     href: '/app/settings',  icon: Settings, color: 'bg-slate-600 text-white' },
];

export function MobileFab() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-[72px] right-4 z-50 md:hidden flex flex-col-reverse items-end gap-2.5">
      {/* Action buttons */}
      {open && ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.href}
            href={action.href}
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg',
              'animate-in slide-in-from-bottom-2 fade-in duration-150',
              action.color,
            )}
          >
            <Icon className="h-4 w-4" />
            {action.label}
          </Link>
        );
      })}

      {/* Overlay to close */}
      {open && (
        <div
          className="fixed inset-0 -z-10"
          onClick={() => setOpen(false)}
        />
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close quick actions' : 'Quick actions'}
        className={cn(
          'h-13 w-13 h-12 w-12 rounded-full shadow-xl flex items-center justify-center',
          'transition-all duration-200 active:scale-95',
          open ? 'bg-slate-700 rotate-45' : 'bg-primary',
        )}
      >
        <Plus className="h-5 w-5 text-white" strokeWidth={2.5} />
      </button>
    </div>
  );
}
