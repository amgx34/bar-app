'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FormStatus } from '@/components/ui/form-status';
import { resendSignup } from './actions';

export function CheckEmail({ email, onReset }: { email: string; onReset: () => void }) {
  const [wait, setWait] = useState(60);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'error' | 'success'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const lead = useRef<HTMLParagraphElement>(null);
  // The submit button that held focus unmounted when this state appeared.
  useEffect(() => { lead.current?.focus(); }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function resend() {
    setBusy(true);
    setStatus('idle');
    let r;
    try { r = await resendSignup(email); } catch { r = { ok: false as const, message: 'Could not send. Check your connection and try again.' }; }
    setBusy(false);
    if (r.ok) { setStatus('success'); setMessage('Sent again. It can take a minute. You can ask for up to 3 an hour.'); setWait(60); }
    else { setStatus('error'); setMessage(r.message); }
  }

  return (
    <div className="space-y-4 text-white/80">
      <p ref={lead} tabIndex={-1} className="text-sm outline-none">
        We sent a link to <strong className="text-white break-all">{email}</strong>. Open it on this device or any other.
      </p>
      <p className="text-sm text-white/60">It can take a minute. Look in spam.</p>
      <FormStatus
        status={status}
        message={message}
        className={status === 'error'
          ? 'border-red-400/40 bg-red-500/15 text-red-300'
          : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full h-11 border-white/20 text-white/80 bg-white/5 hover:bg-white/15 hover:text-white"
        onClick={resend}
        disabled={busy || wait > 0}
      >
        {busy ? 'Sending…' : wait > 0 ? <><span aria-hidden>Send it again in {wait}s</span><span className="sr-only">Send it again, available shortly</span></> : 'Send it again'}
      </Button>
      <button type="button" onClick={onReset} className="min-h-11 w-full text-sm text-white/70 underline underline-offset-4 hover:text-white">
        Use a different email
      </button>
      <p className="text-center text-sm text-white/60">
        Already have an account? <Link href="/login" className="inline-flex min-h-11 items-center text-white underline underline-offset-4">Log in</Link>, or ask for a login link there.
      </p>
    </div>
  );
}
