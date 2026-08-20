import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Employees' };

/**
 * Retired in favour of /app/payroll/employees.
 *
 * The two routes rendered the same staff list from different places with no
 * link between them, so an edit made in one looked missing from the other. Kept
 * as a redirect rather than deleted: it was in the sidebar for months and will
 * be bookmarked.
 */
export default function EmployeesRedirectPage() {
  redirect('/app/payroll/employees');
}
