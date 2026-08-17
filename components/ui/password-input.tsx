'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Password field with a reveal toggle.
 *
 * Typing a password blind on a phone, one-handed, behind a bar, is where most
 * failed logins come from. Revealing it is a genuine security trade — someone
 * can be standing behind you — so it defaults to hidden and is never remembered
 * across renders.
 *
 * The toggle is a real <button type="button">. Inside a form, a button without
 * an explicit type submits it, so an unlabelled reveal control would try to log
 * you in with a half-typed password.
 */
export function PasswordInput({
  className,
  toggleClassName,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'type'> & {
  toggleClassName?: string;
}) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        // Room for the button, so a long password never runs underneath it.
        className={cn('pr-10', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // The state is in the label rather than conveyed by the icon alone.
        aria-label={visible ? 'Hide password' : 'Show password'}
        // aria-pressed makes this a toggle rather than an action, so assistive
        // tech announces the new state after a press without re-reading it.
        aria-pressed={visible}
        // Skipped in the tab order: it sits between the password field and the
        // submit button, and stopping there on the way to logging in is a
        // nuisance for the keyboard users who never need it. Still reachable
        // by click, touch, and screen-reader navigation.
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg',
          'text-muted-foreground hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'transition-colors duration-200 cursor-pointer',
          toggleClassName,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
