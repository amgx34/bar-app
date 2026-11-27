// RLS lets a member read every membership row of their bar, so "the first row"
// can be the owner's. Everything here keys on the caller's own user_id.
type Row = { user_id?: string | null; organization_id: string; created_at?: string | null };

export function ownMemberships<T extends Row>(rows: T[] | null | undefined, userId: string): T[] {
  return (rows ?? []).filter((r) => !!r.user_id && r.user_id === userId);
}

/** Preferred org if the caller truly belongs to it, else their oldest own membership (ties by org id). */
export function selectActive<T extends Row>(
  rows: T[] | null | undefined,
  userId: string,
  preferredOrgId?: string | null,
): T | null {
  const own = ownMemberships(rows, userId).sort(
    (a, b) =>
      (a.created_at ?? '').localeCompare(b.created_at ?? '') ||
      a.organization_id.localeCompare(b.organization_id),
  );
  return own.find((m) => m.organization_id === preferredOrgId) ?? own[0] ?? null;
}
