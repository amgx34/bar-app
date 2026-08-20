'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOBILE_PRIMARY, mobileOverflow, isActive } from './nav-config';

/**
 * Phone navigation.
 *
 * Four destinations plus More. The previous version had five hard-coded links
 * and no overflow, so Employees, Tips, Tax and Settings had no route on a phone
 * at all unless you knew to open the sidebar sheet — half the app, unreachable.
 *
 * Five targets is the practical ceiling on a 375px bar before they get too
 * narrow to hit, which is why the fifth slot buys everything else rather than
 * one more destination.
 *
 * Layering uses the named scale in globals.css rather than raw z-40/z-50. The
 * floating action button sits at z-fab (45), above the bar itself, so a drawer
 * at a hand-picked z-50 still had the FAB punching through it and covering a
 * destination. z-nav-top puts both backdrop and sheet above it.
 */
export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const overflow = mobileOverflow();

  // A section reached from the More sheet should still show More as current,
  // or the bar claims you are nowhere.
  const inOverflow = overflow.some((item) => isActive(item.href, pathname));

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-nav-top bg-background/80 backdrop-blur-sm sm:hidden"
          onClick={() => setMoreOpen(false)}
          aria-hidden
        />
      )}

      {moreOpen && (
        <div
          className="fixed inset-x-0 bottom-0 z-nav-top rounded-t-2xl border-t bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:hidden"
          role="dialog"
          aria-label="More sections"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">More</p>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              aria-label="Close"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <ul className="grid grid-cols-2 gap-2">
            {overflow.map(({ label, href, icon: Icon }) => {
              const active = isActive(href, pathname);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[3rem] items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-foreground hover:bg-muted',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-nav border-t bg-card pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <div className="flex">
          {MOBILE_PRIMARY.map(({ label, href, icon: Icon }) => {
            // Dashboard is a prefix of nothing, but Inventory and Payroll are
            // prefixes of their children — so only the root needs exact match.
            const active = isActive(href, pathname, href === '/app/dashboard');
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-label="More sections"
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
              moreOpen || inOverflow ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
            More
          </button>
        </div>
      </nav>
    </>
  );
}
