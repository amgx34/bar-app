import type { Metadata } from 'next';
import { Suspense } from 'react';
import EmployeesTab from '../_components/employees-tab';
import { PendingClaims } from '../_components/pending-claims';
import { loadEmployees } from '../_shared';
import { listPendingClaims } from '../claim-actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Employees' };

/**
 * Staff, their roles, rates and tip modes.
 *
 * This absorbed the old top-level /app/employees route, which showed the same
 * thing from a second place with no link between them.
 */
export default async function PayrollEmployeesPage() {
  const [employees, claims] = await Promise.all([
    loadEmployees(),
    listPendingClaims(),
  ]);

  return (
    <div className="space-y-4 p-5 sm:p-6">
      {/*
        Above the roster on purpose: somebody waiting on a login is a task, and
        the roster below is a reference. PendingClaims renders nothing at all
        when the queue is empty, which is nearly always.
      */}
      <PendingClaims claims={claims} roster={employees as never} />
      <Suspense fallback={<div>Loading employees…</div>}>
        <EmployeesTab employees={employees as never} />
      </Suspense>
    </div>
  );
}
