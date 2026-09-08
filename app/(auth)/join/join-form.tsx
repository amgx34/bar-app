'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { claimEmployeeAccount } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { FormStatus } from '@/components/ui/form-status';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';

const FIELD =
  'bg-white/10 border-white/20 text-white placeholder:text-white/30 focus-visible:ring-white/30';

/**
 * Staff sign-up.
 *
 * The name is TYPED, never picked from a list. A roster here would turn the
 * join code — which ends up written on a whiteboard — into a staff directory.
 * The server returns the same message whatever happens, so this form has no
 * success/failure branch that could leak one either.
 */
export function JoinForm() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode]         = useState('');
  const [name, setName]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState<'idle' | 'error' | 'success'>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus('idle');
    setStatusMessage(null);

    const result = await claimEmployeeAccount(email, password, code, name);
    setLoading(false);

    if (!result.ok) {
      setStatus('error');
      setStatusMessage(result.message);
      toast.error(result.message);
      return;
    }

    // Replaces the form entirely. Leaving the fields up invites a second
    // submission, and the only thing that achieves is a duplicate no-op.
    setDone(true);
    setStatus('success');
    setStatusMessage(result.message);
    toast.success(result.message);
  }

  if (done) {
    return (
      <Card className="w-full max-w-sm bg-white/10 backdrop-blur-xl border-white/15 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-white">Request sent</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-white/70">
            {statusMessage} You&rsquo;ll be able to log in once they approve it.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm bg-white/10 backdrop-blur-xl border-white/15 shadow-2xl">
      <CardHeader>
        <CardTitle className="text-white">Staff sign-up</CardTitle>
        <CardDescription className="text-white/60">
          See your hours and what you earned
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="join-code" className="text-white/80">Bar code</Label>
            <Input
              id="join-code" required autoComplete="off"
              value={code} onChange={(e) => setCode(e.target.value)}
              className={FIELD}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-name" className="text-white/80">
              Your name, as your manager writes it
            </Label>
            <Input
              id="join-name" required autoComplete="name"
              value={name} onChange={(e) => setName(e.target.value)}
              className={FIELD}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-email" className="text-white/80">Email</Label>
            <Input
              id="join-email" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-password" className="text-white/80">Password</Label>
            <PasswordInput
              id="join-password" required autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className={FIELD}
              toggleClassName="text-white/50 hover:text-white"
            />
          </div>

          <FormStatus status={status} message={statusMessage} />

          <Button
            type="submit"
            className="w-full bg-white text-gray-900 hover:bg-white/90"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Sending…
              </>
            ) : 'Request access'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
