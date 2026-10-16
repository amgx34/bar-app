import type { Metadata } from 'next';
import { Suspense } from 'react';
import EmployeesTab from '../_components/employees-tab';
import TaxSetupPanel from '../_components/tax-setup-panel';
import { PendingClaims } from '../_components/pending-claims';
import { loadEmployees, toLocalDateStr } from '../_shared';
import { listPendingClaims } from '../claim-actions';
import { getCurrentOrg } from '@/lib/org';
import { canManagePayroll } from '@/lib/permissions';
import { taxConfigFromSettings } from '@/lib/payroll/tax/settings';
import { taxYearForPeriod } from '@/lib/payroll/tax/tables';
import { tablesStatus } from '@/lib/payroll/tax/ui';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Employees' };

/**
 * Staff, their roles, rates and tip modes.
 *
 * This absorbed the old top-level /app/employees route, which showed the same
 * thing from a second place with no link between them.
 */
export default async function PayrollEmployeesPage() {
  const { org, role } = await getCurrentOrg();
  const [employees, claims] = await Promise.all([
    loadEmployees(),
    listPendingClaims(),
  ]);

  const isOwner = role === 'owner';
  // tablesStatus never throws; a missing or placeholder year becomes a warning.
  const tables = tablesStatus(taxYearForPeriod(toLocalDateStr(new Date())));

  return (
    <div className="space-y-4 p-5 sm:p-6">
      {/*
        Above the roster on purpose: somebody waiting on a login is a task, and
        the roster below is a reference. PendingClaims renders nothing at all
        when the queue is empty, which is nearly always.
      */}
      <PendingClaims claims={claims} roster={employees as never} />
      {isOwner && (
        <TaxSetupPanel
          initial={taxConfigFromSettings((org.bar_settings ?? {}) as Record<string, unknown>)}
          tables={tables}
        />
      )}
      <Suspense fallback={<div>Loading employees…</div>}>
        <EmployeesTab employees={employees as never} canEditTax={canManagePayroll(role)} />
      </Suspense>
    </div>
  );
}
