'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import { withTaxConfig, hasExplicitPayFrequency } from '@/lib/payroll/tax/settings';
import type { OrgTaxConfig } from '@/lib/payroll/tax/types';
import { taxYearForPeriod } from '@/lib/payroll/tax/tables';
import {
  employeeTaxFieldsFromForm,
  orgTaxPatchError,
  type EmployeeTaxFields,
  type EmployeeTaxForm,
} from '@/lib/payroll/tax/ui';
import { toLocalDateStr } from './_shared';

export async function saveOrgTaxConfig(patch: Partial<OrgTaxConfig>): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!org?.id) throw new Error('Organization not found');
  if (role !== 'owner') throw new Error('Only an owner can change tax settings');

  const supabase = await createClient();

  // Read, then merge, then write. bar_settings is one JSON column with several
  // writers; spreading a stale copy is the pos_config bug.
  const { data, error: readError } = await supabase
    .from('organizations').select('bar_settings').eq('id', org.id).maybeSingle();
  if (readError) throw new Error(readError.message);

  const current = (data?.bar_settings ?? {}) as Record<string, unknown>;
  // Validated against the STORED settings: whether a pay frequency was ever
  // chosen is a fact about the row, not about this patch.
  const invalid = orgTaxPatchError(
    patch,
    taxYearForPeriod(toLocalDateStr(new Date())),
    hasExplicitPayFrequency(current),
  );
  if (invalid) throw new Error(invalid);

  const next = withTaxConfig(current, patch);

  const { error } = await supabase
    .from('organizations').update({ bar_settings: next }).eq('id', org.id);
  if (error) throw new Error(error.message);

  revalidatePath('/app/payroll/employees');
}

export async function saveEmployeeTaxProfile(
  employeeId: string,
  form: EmployeeTaxForm,
): Promise<EmployeeTaxFields> {
  const { org, role } = await getCurrentOrg();
  if (!org?.id) throw new Error('Organization not found');
  if (role !== 'owner' && role !== 'manager') throw new Error('Not permitted');

  // A server action is a public endpoint: validate here, with the same function
  // the dialog uses. Its output is exactly the eight columns, so it is also the
  // allowlist; nothing the client sent beyond them reaches .update().
  const checked = employeeTaxFieldsFromForm(form);
  if (!checked.ok) throw new Error(checked.error);
  const fields = checked.fields;

  const supabase = await createClient();
  const { error } = await supabase
    .from('employees')
    .update(fields)
    .eq('id', employeeId)
    .eq('organization_id', org.id); // scoped by hand — see AGENTS.md
  if (error) throw new Error(error.message);

  revalidatePath('/app/payroll/employees');
  return fields;
}
