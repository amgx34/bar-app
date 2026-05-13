import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import { computePayroll } from '../payroll/actions';
import EmployeeRoster from './_components/employee-roster';
import type { Employee } from '../payroll/actions';

export const dynamic = 'force-dynamic';

export default async function EmployeesPage() {
  const { org } = await getCurrentOrg();
  const supabase = await createClient();

  const today = new Date().toISOString().split('T')[0];

  const [{ data: employees }, allTimePayroll] = await Promise.all([
    supabase
      .from('employees')
      .select('id, name, role, hourly_rate, tip_mode')
      .eq('organization_id', org.id)
      .order('name'),
    computePayroll('2000-01-01', today),
  ]);

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
        <p className="text-muted-foreground">
          Staff roster with all-time earnings across every imported pay period
        </p>
      </div>

      <EmployeeRoster
        employees={(employees ?? []) as Employee[]}
        payroll={allTimePayroll}
      />
    </main>
  );
}
