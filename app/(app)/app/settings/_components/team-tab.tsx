'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserPlus, Trash2, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  addTeamMember, changeMemberRole, removeTeamMember, type TeamMember,
} from '../team-actions';
import type { Role } from '@/lib/permissions';

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: 'owner',      label: 'Owner',      hint: 'Full access, incl. team & billing' },
  { value: 'manager',    label: 'Manager',    hint: 'Edit settings, payroll, inventory' },
  { value: 'accountant', label: 'Accountant', hint: 'View books & payroll' },
];

const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)?.label ?? r;

/** Browser-side temp password generator (no ambiguous chars). */
function generatePassword(len = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function TeamTab({
  initialMembers,
  canManage,
}: {
  initialMembers: TeamMember[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]         = useState<Role>('manager');
  const [adding, setAdding]     = useState(false);
  const [busyId, setBusyId]     = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await addTeamMember({ email, password, role });
      toast.success(
        res.status === 'created'
          ? `Added ${res.email} — share the temporary password so they can log in.`
          : `${res.email} already had an account and was added to this bar.`,
      );
      setEmail(''); setPassword(''); setRole('manager');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add member');
    } finally {
      setAdding(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: Role) {
    setBusyId(userId);
    try {
      await changeMemberRole({ userId, role: newRole });
      toast.success('Role updated');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update role');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    const userId = removeTarget.user_id;
    setBusyId(userId);
    try {
      await removeTeamMember({ userId });
      toast.success('Member removed');
      setRemoveTarget(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove member');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Members */}
      <div className="rounded-xl border bg-card p-5 space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Team Members</h3>
        <div className="divide-y">
          {initialMembers.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {m.email}
                  {m.is_self && <span className="font-normal text-muted-foreground"> (you)</span>}
                </p>
                {m.joined_at && (
                  <p className="text-xs text-muted-foreground">
                    Joined {new Date(m.joined_at).toLocaleDateString()}
                  </p>
                )}
              </div>

              {canManage && !m.is_self ? (
                <>
                  <Select
                    value={m.role}
                    onValueChange={(v) => handleRoleChange(m.user_id, v as Role)}
                    disabled={busyId === m.user_id}
                  >
                    <SelectTrigger className="w-36"><span className="text-sm">{roleLabel(m.role)}</span></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="ghost" size="icon"
                    className="text-destructive hover:text-destructive"
                    disabled={busyId === m.user_id}
                    onClick={() => setRemoveTarget(m)}
                    aria-label={`Remove ${m.email}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Badge variant="secondary">{roleLabel(m.role)}</Badge>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add member */}
      {canManage ? (
        <form onSubmit={handleAdd} className="rounded-xl border bg-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Add a Teammate</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Creates a login and grants access to <span className="font-medium">this bar</span>.
              Share the temporary password — they can change it after logging in.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email" required placeholder="teammate@email.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger><span className="text-sm">{roleLabel(role)}</span></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <div className="flex flex-col">
                        <span>{r.label}</span>
                        <span className="text-xs text-muted-foreground">{r.hint}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Temporary Password</Label>
            <div className="flex gap-2">
              <Input
                required minLength={8} placeholder="At least 8 characters"
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
              />
              <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())} className="shrink-0 gap-1.5">
                <Shuffle className="h-3.5 w-3.5" /> Generate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              If they already have an account, this is ignored and they’re simply added to this bar.
            </p>
          </div>

          <Button type="submit" disabled={adding} className="gap-2">
            <UserPlus className="h-4 w-4" />
            {adding ? 'Adding…' : 'Add teammate'}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Only the bar owner can add or remove team members.</p>
      )}

      {/* Remove confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              They’ll immediately lose access to this bar. Their login account isn’t deleted,
              and any other bars they belong to are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busyId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={!!busyId}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {busyId ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
