'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { signUpOwner } from './actions';
import { checkPassword } from '@/lib/auth/password';
import { CheckEmail } from './check-email';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { FormStatus } from '@/components/ui/form-status';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const FIELD = 'h-11 bg-white/10 border-white/20 text-white placeholder:text-white/30 focus-visible:ring-white/30';

export function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [trap, setTrap] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const pw = checkPassword(password, email);
    if (!pw.ok) { setMessage(pw.reason); return; }
    setLoading(true);
    try {
      const r = await signUpOwner(email, password, trap);
      if (r.ok) setSent(true); else setMessage(r.message);
    } catch {
      setMessage('Could not reach Rail. Check your connection and try again.');
    }
    setLoading(false);
  }

  return (
    <Card className="w-full max-w-sm bg-white/10 backdrop-blur-xl border-white/15 shadow-2xl">
      <CardHeader>
        <CardTitle className="text-white">{sent ? 'Check your email' : 'Create your account'}</CardTitle>
        <CardDescription className="text-white/60">
          {sent ? 'One more step.' : 'Payroll, tips and stock for your bar.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <CheckEmail email={email.trim().toLowerCase()} onReset={() => { setSent(false); setPassword(''); }} />
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/80">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} className={FIELD} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/80">Password</Label>
              <PasswordInput id="password" autoComplete="new-password" required value={password}
                aria-describedby="pw-hint" onChange={(e) => setPassword(e.target.value)}
                className={FIELD} toggleClassName="text-white/50 hover:text-white" />
              <p id="pw-hint" className="text-xs text-white/60">At least 10 characters.</p>
            </div>
            {/* Honeypot: off-screen, out of the tab order, hidden from assistive tech. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>Website<input tabIndex={-1} autoComplete="off" name="website" value={trap} onChange={(e) => setTrap(e.target.value)} /></label>
            </div>
            <FormStatus status={message ? 'error' : 'idle'} message={message}
              className="border-red-400/40 bg-red-500/15 text-red-300" />
            <Button type="submit" className="w-full h-11 bg-white text-gray-900 hover:bg-white/90" disabled={loading}>
              {loading ? (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Creating account…</>) : 'Create account'}
            </Button>
            <p className="text-xs text-white/60">
              You will agree to our <Link href="/terms" className="underline">Terms</Link> and{' '}
              <Link href="/privacy" className="underline">Privacy Policy</Link> when you create your bar.
            </p>
            <p className="text-sm text-white/60">
              Already have an account? <Link href="/login" className="text-white underline underline-offset-4">Log in</Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function SignupClosed() {
  return (
    <Card className="w-full max-w-sm bg-white/10 backdrop-blur-xl border-white/15 shadow-2xl">
      <CardHeader>
        <CardTitle className="text-white">Rail is invite only right now</CardTitle>
        <CardDescription className="text-white/60">
          We set up each bar by hand. Request access and we will get you started.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Link href="/#contact" className="flex min-h-11 w-full items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-gray-900 hover:bg-white/90">
          Request access
        </Link>
        <p className="text-center text-sm text-white/60">
          Already have an account? <Link href="/login" className="text-white underline underline-offset-4">Log in</Link>
        </p>
      </CardContent>
    </Card>
  );
}
