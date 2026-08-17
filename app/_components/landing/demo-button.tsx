'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, PlayCircle } from 'lucide-react';

interface Props {
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

export function DemoButton({ size = 'default', className = '' }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      // POST, not a navigation: the route provisions a user, an org and a
      // seeded dataset, so it must not be reachable by prefetch or crawl.
      const res = await fetch('/api/demo', { method: 'POST' });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        toast.error(
          body?.error ??
            (res.status === 429
              ? 'Too many demo sessions from this address. Try again later.'
              : 'Demo is unavailable right now.'),
        );
        setLoading(false);
        return;
      }

      // Already signed in: the route deliberately provisioned nothing rather
      // than replacing their session with a throwaway demo account. Say so,
      // because otherwise landing on their own dashboard looks like the demo
      // failed to load.
      if (body?.alreadySignedIn) {
        toast.info('You are already signed in — taking you to your own bar.');
      }

      window.location.href = body?.redirectTo ?? '/app/dashboard';
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
      setLoading(false);
    }
  }

  const sizeClasses = {
    sm:      'h-9 px-4 text-sm',
    default: 'h-10 px-6 text-sm',
    lg:      'h-12 px-8 text-base',
  }[size];

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2 font-semibold rounded-lg border-2 border-primary text-primary cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${sizeClasses} ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Setting up demo…
        </>
      ) : (
        <>
          <PlayCircle className="h-4 w-4" />
          Try Demo Account
        </>
      )}
    </button>
  );
}
