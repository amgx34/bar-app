'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Light / dark / system, as a three-state cycle.
 *
 * A cycle rather than a dropdown because it lives in a header next to a menu
 * that already opens on click — a second popover there is one layer too many
 * for a control most people press once and forget.
 *
 * "System" is a real third state, not an absence of choice: someone whose
 * laptop switches at sunset wants the app to follow, and collapsing that into
 * a two-way switch quietly takes it away.
 */

const ORDER = ['light', 'dark', 'system'] as const;
type ThemeName = (typeof ORDER)[number];

const META: Record<ThemeName, { icon: typeof Sun; label: string }> = {
  light:  { icon: Sun,     label: 'Light' },
  dark:   { icon: Moon,    label: 'Dark' },
  system: { icon: Monitor, label: 'System' },
};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  // The server cannot know the theme — it lives in localStorage and the OS — so
  // the first client render must match the server's. Without this gate the icon
  // hydrates differently than it rendered and React discards the tree.
  //
  // useSyncExternalStore rather than the usual useState+useEffect pair: it
  // returns the server snapshot (false) during hydration and the client
  // snapshot (true) afterwards, without a setState in an effect body that
  // triggers a second render pass.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const current = (ORDER.includes(theme as ThemeName) ? theme : 'system') as ThemeName;
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = META[current].icon;

  if (!mounted) {
    // Same box, no icon. Reserving the space stops the header reflowing when
    // the real control appears a frame later.
    return (
      <div
        className={cn('h-9 w-9 shrink-0', className)}
        aria-hidden
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      // The accessible name states BOTH the current setting and what pressing
      // does. A button labelled only "Dark" is ambiguous about whether that is
      // the state or the action.
      aria-label={`Theme: ${META[current].label}${
        current === 'system' && resolvedTheme ? ` (${resolvedTheme})` : ''
      }. Switch to ${META[next].label}.`}
      title={`Theme: ${META[current].label} — switch to ${META[next].label}`}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
        'text-muted-foreground hover:text-foreground hover:bg-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'transition-colors duration-200 cursor-pointer',
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
