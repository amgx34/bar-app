'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { approveClaim, rejectClaim, type PendingClaim } from '../claim-actions';
import type { Employee } from '../actions';

/**
 * Staff waiting to be let in.
 *
 * The manager is the verification step — the join code only gets somebody into
 * this queue. So the screen shows what the person TYPED, not a tidied-up match:
 * the question being answered is "do I know this person", and the typed string
 * is the evidence for it.
 *
 * A claim whose name matched two employees arrives unresolved and the manager
 * picks. Approving cannot proceed without that choice — an active account with
 * no employee is the one state that would build a session pointing at nobody.
 */
export function PendingClaims({
  claims,
  roster,
}: {
  claims: PendingClaim[];
  roster: Employee[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  // Only for the ambiguous ones; a resolved claim already knows its employee.
  const [picked, setPicked] = useState<Record<string, string>>({});

  // Nothing pending is not an empty state worth drawing. It is the normal case.
  if (claims.length === 0) return null;

  async function handleApprove(claim: PendingClaim) {
    const employeeId = claim.employeeId ?? picked[claim.id];
    if (!employeeId) {
      toast.error('Pick which employee this is first.');
      return;
    }
    setBusyId(claim.id);
    try {
      await approveClaim(claim.id, employeeId);
      toast.success(`${claim.claimedName} can now see their own hours and pay.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not approve');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(claim: PendingClaim) {
    setBusyId(claim.id);
    try {
      await rejectClaim(claim.id);
      toast.success('Request declined.');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not decline');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div>
        <h2 className="text-sm font-semibold">
          {claims.length === 1
            ? '1 person is waiting for a login'
            : `${claims.length} people are waiting for a login`}
        </h2>
        <p className="text-xs text-muted-foreground">
          They will only ever see their own hours and pay. Approve only people
          you recognise.
        </p>
      </div>

      <div className="space-y-2">
        {claims.map((claim) => (
          <div
            key={claim.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"
          >
            <div className="min-w-0">
              <p className="font-medium">{claim.claimedName}</p>
              <p className="text-xs text-muted-foreground">
                {/* Said plainly when we could not resolve it. */}
                {claim.employeeName
                  ? `Matches ${claim.employeeName}`
                  : 'Two people share this name — pick which one'}
                {' · '}
                {new Date(claim.requestedAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {!claim.employeeId && (
                <Select
                  value={picked[claim.id] ?? ''}
                  onValueChange={(v) =>
                    setPicked((p) => ({ ...p, [claim.id]: String(v) }))
                  }
                >
                  <SelectTrigger className="w-44 text-sm">
                    {roster.find((e) => e.id === picked[claim.id])?.name ?? 'Choose employee'}
                  </SelectTrigger>
                  <SelectContent>
                    {roster.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                size="sm"
                disabled={busyId === claim.id}
                onClick={() => handleApprove(claim)}
              >
                <UserCheck className="h-3.5 w-3.5" aria-hidden />
                Approve
              </Button>
              <Button
                size="sm" variant="ghost"
                disabled={busyId === claim.id}
                onClick={() => handleReject(claim)}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
