'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { signInWithPassword, sendMagicLink } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { FormStatus } from '@/components/ui/form-status';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/app/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  // Inline state as well as the toast. A toast on a login failure vanishes
  // before someone re-reading their password has finished, and on a phone it
  // covers the field they are trying to correct.
  const [status, setStatus] = useState<'idle' | 'error' | 'success'>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Both flows go through server actions so they can be rate-limited and so
  // Supabase's error text never reaches the browser. See ./actions.ts.
  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus('idle');
    setStatusMessage(null);
    const result = await signInWithPassword(email, password);
    setLoading(false);

    if (!result.ok) {
      setStatus('error');
      setStatusMessage(result.message);
      toast.error(result.message);
      return;
    }
    setStatus('success');
    setStatusMessage('Signed in — taking you to your dashboard.');
    router.push(next);
    router.refresh(); // forces server components to re-fetch with the new session
  }

  async function handleMagicLink() {
    if (!email) {
      setStatus('error');
      setStatusMessage('Enter your email first.');
      toast.error('Enter your email first');
      return;
    }
    setMagicLoading(true);
    setStatus('idle');
    setStatusMessage(null);
    const result = await sendMagicLink(
      email,
      `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
    );
    setMagicLoading(false);

    if (!result.ok) {
      setStatus('error');
      setStatusMessage(result.message);
      toast.error(result.message);
      return;
    }
    // Same message whether or not the address has an account.
    setStatus('success');
    setStatusMessage('If that email has an account, a login link is on its way.');
    toast.success('If that email has an account, a login link is on its way.');
  }

  return (
    <Card className="w-full max-w-sm bg-white/10 backdrop-blur-xl border-white/15 shadow-2xl">
      <CardHeader>
        <CardTitle className="text-white">Log in</CardTitle>
        <CardDescription className="text-white/60">Access your bar&apos;s dashboard</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-white/80">Email</Label>
            <Input
              id="email" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus-visible:ring-white/30"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-white/80">Password</Label>
            <PasswordInput
              id="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus-visible:ring-white/30"
              toggleClassName="text-white/50 hover:text-white"
            />
          </div>
          <FormStatus status={status} message={statusMessage} />

          <Button type="submit" className="w-full bg-white text-gray-900 hover:bg-white/90" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Logging in…
              </>
            ) : 'Log in'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-white/20" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-transparent px-2 text-white/40">or</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full border-white/20 text-white/80 bg-white/5 hover:bg-white/15 hover:text-white"
          onClick={handleMagicLink} disabled={magicLoading}
        >
          {magicLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Sending…
            </>
          ) : 'Email me a magic link'}
        </Button>

      </CardContent>
    </Card>
  );
}