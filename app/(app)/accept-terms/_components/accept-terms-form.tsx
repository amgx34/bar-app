'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { acceptTerms } from '../actions';

/**
 * The checkbox is required rather than implied by the button.
 *
 * A button labelled "I agree" is technically consent, but a deliberate tick is
 * the thing that stands up later — and it costs the user one click on a screen
 * they see once.
 */
export function AcceptTermsForm({
  next,
  version,
}: {
  next: string;
  version: string;
}) {
  const [agreed, setAgreed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!agreed) {
      toast.error('Tick the box to confirm you agree');
      return;
    }
    startTransition(async () => {
      try {
        await acceptTerms(next);
      } catch (err) {
        // A server action that redirects throws a control-flow signal Next
        // handles itself; anything reaching here is a real failure.
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) return;
        toast.error(
          err instanceof Error ? err.message : 'Could not record your acceptance',
        );
      }
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/40 transition-colors">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary cursor-pointer"
        />
        <span className="text-sm leading-relaxed">
          I have read and agree to the Terms of Service and the Privacy Policy, and I
          am authorised to accept them for my business.
        </span>
      </label>

      <Button onClick={submit} disabled={!agreed || isPending} className="w-full">
        {isPending ? 'Saving…' : 'Agree and continue'}
      </Button>

      <p className="text-xs text-muted-foreground">
        Recording acceptance of version {version}.
      </p>
    </div>
  );
}
