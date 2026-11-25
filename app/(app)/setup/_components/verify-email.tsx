'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { signOut } from '../../app/actions';
import { resendConfirmation } from '../actions';

export function VerifyEmail({ email }: { email: string | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function resend() {
    setBusy(true);
    try {
      const r = await resendConfirmation();
      setMsg({ ok: r.ok, text: r.message });
    } catch {
      setMsg({ ok: false, text: 'We could not send the link. Try again in a minute.' });
    }
    setBusy(false);
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-sidebar text-sidebar-foreground">
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/5 p-6 text-center space-y-4">
        <h1 className="text-xl font-bold text-white">Verify your email first</h1>
        <p className="text-sm text-white/80">
          We need to confirm {email ?? 'your address'} before you can create a bar. Open the link in the email we sent, then come back here.
        </p>
        <Button type="button" onClick={resend} disabled={busy} className="w-full h-11 bg-cta text-cta-foreground hover:brightness-95">
          {busy ? 'Sending…' : 'Send the link again'}
        </Button>
        {msg && (
          <p role="status" className={msg.ok ? 'text-sm text-white/90' : 'text-sm text-red-200'}>{msg.text}</p>
        )}
        <form action={signOut}>
          <button type="submit" className="text-sm text-white underline underline-offset-2">
            Wrong address? Sign out and start over
          </button>
        </form>
      </div>
    </main>
  );
}
