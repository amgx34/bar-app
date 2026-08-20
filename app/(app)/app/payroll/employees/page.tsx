import type { Metadata } from 'next';
import { Suspense } from 'react';
import EmployeesTab from '../_components/employees-tab';
import { loadEmployees } from '../_shared';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Employees' };

/**
 * Staff, their roles, rates and tip modes.
 *
 * This absorbed the old top-level /app/employees route, which showed the same
 * thing from a second place with no link between them.
 */
export default async function PayrollEmployeesPage() {
  const employees = await loadEmployees();

  return (
    <div className="p-5 sm:p-6">
      <Suspense fallback={<div>Loading employees…</div>}>
        <EmployeesTab employees={employees as never} />
      </Suspense>
    </div>
  );
}
