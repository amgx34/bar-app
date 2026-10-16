'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import { withTaxConfig } from '@/lib/payroll/tax/settings';
import type { OrgTaxConfig } from '@/lib/payroll/tax/types';
import type { EmployeeTaxFields } from '@/lib/payroll/tax/ui';

const FREQS = ['weekly', 'biweekly', 'semimonthly', 'monthly'];

export async function saveOrgTaxConfig(patch: Partial<OrgTaxConfig>): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!org?.id) throw new Error('Organization not found');
  if (role !== 'owner') throw new Error('Only an owner can change tax settings');

  if (patch.payFrequency !== undefined && !FREQS.includes(patch.payFrequency)) {
    throw new Error('Invalid pay frequency');
  }
  if (
    patch.stateRate !== undefined &&
    !(Number.isFinite(patch.stateRate) && patch.stateRate >= 0 && patch.stateRate <= 100)
  ) {
    throw new Error('State rate must be between 0 and 100');
  }

  const supabase = await createClient();

  // Read, then merge, then write. bar_settings is one JSON column with several
  // writers; spreading a stale copy is the pos_config bug.
  const { data, error: readError } = await supabase
    .from('organizations').select('bar_settings').eq('id', org.id).maybeSingle();
  if (readError) throw new Error(readError.message);

  const next = withTaxConfig(
    (data?.bar_settings ?? {}) as Record<string, unknown>,
    patch,
  );

  const { error } = await supabase
    .from('organizations').update({ bar_settings: next }).eq('id', org.id);
  if (error) throw new Error(error.message);

  revalidatePath('/app/payroll/employees');
}

export async function saveEmployeeTaxProfile(
  employeeId: string,
  fields: EmployeeTaxFields,
): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!org?.id) throw new Error('Organization not found');
  if (role !== 'owner' && role !== 'manager') throw new Error('Not permitted');

  const supabase = await createClient();
  const { error } = await supabase
    .from('employees')
    .update(fields)
    .eq('id', employeeId)
    .eq('organization_id', org.id); // scoped by hand — see AGENTS.md
  if (error) throw new Error(error.message);

  revalidatePath('/app/payroll/employees');
}
