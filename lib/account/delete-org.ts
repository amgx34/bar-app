import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { planDeletion, type Retention } from './deletion-plan';

export type DeletionResult = { deleted: string[]; retained: string[] };

/** Is the typed-and-owner-checked deletion switched on? Off unless the owner sets it on Vercel. */
export const deletionEnabled = () => process.env.ACCOUNT_DELETION_OPEN === 'true';

/**
 * Executes the plan for ONE org. The caller has already checked the caller's role
 * in `orgId` and the typed confirmation. Stops at the first error and reports it:
 * steps are idempotent and memberships go last, so the owner can retry.
 */
export async function deleteOrg(input: {
  orgId: string; role: string | null; userId: string; retention?: Retention;
}): Promise<DeletionResult> {
  const plan = planDeletion({ role: input.role, orgId: input.orgId, retention: input.retention });
  const admin = createAdminClient();
  const deleted: string[] = [];

  for (const step of plan.steps) {
    if (step.table === 'memberships') {
      // Record the closure first: this is the audit trail, and it lives on the row we keep.
      if (!plan.deleteOrgRow) {
        const { data: cur } = await admin.from('organizations').select('bar_settings')
          .eq('id', plan.orgId).single();
        const { error } = await admin.from('organizations').update({
          staff_join_code: null,
          bar_settings: {
            ...((cur?.bar_settings as object | null) ?? {}),
            account_closure: {
              closed_at: new Date().toISOString(), closed_by: input.userId,
              deleted, retained: plan.retained,
            },
          },
        }).eq('id', plan.orgId);
        if (error) throw new Error(`Could not record the closure: ${error.message}`);
      }
      const { error } = await admin.from('memberships').delete().eq('organization_id', plan.orgId);
      if (error) throw new Error(`memberships: ${error.message}`);
      deleted.push('memberships');
      continue;
    }

    if (step.via === 'org') {
      const { error } = await admin.from(step.table).delete().eq('organization_id', plan.orgId);
      if (error) throw new Error(`${step.table}: ${error.message}`);
    } else {
      // No organization_id of its own: resolve the parent's ids inside the org first.
      const { data, error: selErr } = await admin.from(step.parent!).select('id').eq('organization_id', plan.orgId);
      if (selErr) throw new Error(`${step.parent}: ${selErr.message}`);
      const ids = (data ?? []).map((r: { id: string }) => r.id);
      for (let i = 0; i < ids.length; i += 200) {
        // admin-scope-ok: ids were selected above with .eq('organization_id', orgId), so every row is in-org.
        const { error } = await admin.from(step.table).delete().in(step.parentKey!, ids.slice(i, i + 200));
        if (error) throw new Error(`${step.table}: ${error.message}`);
      }
    }
    deleted.push(step.table);
  }

  if (plan.deleteOrgRow) {
    const { error } = await admin.from('organizations').delete().eq('id', plan.orgId);
    if (error) throw new Error(`organizations: ${error.message}`);
    deleted.push('organizations');
  }
  console.info('[account] org closed', { orgId: plan.orgId, by: input.userId, deleted: deleted.length, retained: plan.retained.length });
  return { deleted, retained: plan.retained };
}
