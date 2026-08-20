'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Employee, deleteEmployee, bulkSetTipMode } from '../actions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import EmployeeSetupDialog from './employee-setup-dialog';
import { Plus, Trash2, UserCheck, AlertTriangle, Users } from 'lucide-react';

const ROLE_STYLES: Record<string, string> = {
  bartender: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  barback: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  server: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  manager: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  security: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  other: 'bg-muted text-muted-foreground',
};

const TIP_MODE_LABELS: Record<string, string> = {
  pool: 'Pool',
  barback: 'Barback 15%',
  individual: 'Individual',
  sales_pct: 'Sales %',
  no_tip: 'Not Tipped',
};

interface EmployeesTabProps {
  employees: Employee[];
}

export default function EmployeesTab({ employees: initialEmployees }: EmployeesTabProps) {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (employee: Employee) => {
    if (!confirm(`Remove ${employee.name} from the employee list? This will also delete their shift history.`)) return;

    setDeletingId(employee.id);
    try {
      await deleteEmployee(employee.id);
      setEmployees((prev) => prev.filter((e) => e.id !== employee.id));
      toast.success(`${employee.name} removed`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove employee');
    } finally {
      setDeletingId(null);
    }
  };

  const configured = employees.filter((e) => e.role && e.hourly_rate !== null);
  const unconfigured = employees.filter((e) => !e.role || e.hourly_rate === null);

  const handleBulkTipMode = async (mode: 'pool' | 'individual' | 'sales_pct') => {
    const labels = { pool: 'Tip Pool', individual: 'Individual Tips', sales_pct: 'Sales %' };
    const note =
      mode === 'pool'
        ? 'Security and managers are excluded.'
        : 'Security is excluded.';
    if (!confirm(`Set all eligible employees to ${labels[mode]}? ${note}`)) return;

    try {
      const { updated } = await bulkSetTipMode(mode);
      setEmployees((prev) =>
        prev.map((e) => {
          if (e.role === 'security') return e;
          if (mode === 'pool' && e.role === 'manager') return e;
          return { ...e, tip_mode: mode };
        })
      );
      toast.success(`${updated} employee${updated !== 1 ? 's' : ''} set to ${labels[mode]}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update tip modes');
    }
  };

  return (
    <div className="space-y-5">
      {/* Wraps on a phone. The count block plus the "Set all tips" button group
          measured ~500px side by side, which pushed the Employees tab 130px
          wider than a 375px viewport and scrolled the whole page sideways. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {employees.length} {employees.length === 1 ? 'employee' : 'employees'}
            </p>
            <p className="text-xs text-muted-foreground">
              {configured.length} configured
              {unconfigured.length > 0 && (
                <span className="text-yellow-600 dark:text-yellow-400">
                  {' '}· {unconfigured.length} incomplete
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {employees.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1">
              <span className="text-xs text-muted-foreground pr-1">Set all tips:</span>
              <button
                onClick={() => handleBulkTipMode('pool')}
                className="rounded px-2 py-0.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                Pool
              </button>
              <button
                onClick={() => handleBulkTipMode('individual')}
                className="rounded px-2 py-0.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                Individual
              </button>
              <button
                onClick={() => handleBulkTipMode('sales_pct')}
                className="rounded px-2 py-0.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                Sales %
              </button>
            </div>
          )}
          <Button size="sm" onClick={() => setIsAddingNew(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Employee
          </Button>
        </div>
      </div>

      {employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-muted-foreground">No employees yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add employees manually or import shift data from CSV
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setIsAddingNew(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add First Employee
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Name</TableHead>
                {/* Six nowrap columns measured 571px inside a 343px card, so a
                    phone had to swipe sideways to reach Edit. Role and status
                    ride under the name below `sm`; tip mode is the one column
                    a manager does not need on a phone, so it waits for `md`.
                    Rate and Actions stay — they are why this screen is open. */}
                <TableHead className="hidden sm:table-cell">Role</TableHead>
                <TableHead className="text-right">Hourly Rate</TableHead>
                <TableHead className="hidden md:table-cell">Tip Mode</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => {
                const incomplete = !employee.role || employee.hourly_rate === null;
                return (
                  <TableRow
                    key={employee.id}
                    className={incomplete ? 'bg-yellow-50/40 dark:bg-yellow-950/10' : ''}
                  >
                    <TableCell className="pl-4 font-medium whitespace-normal">
                      {employee.name}
                      {/* Same two facts as the hidden columns, stacked. */}
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
                        <span className="text-xs font-normal capitalize text-muted-foreground">
                          {employee.role ?? 'No role'}
                        </span>
                        {incomplete && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                            <AlertTriangle className="h-3 w-3" />
                            Incomplete
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {employee.role ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                            ROLE_STYLES[employee.role] ?? ROLE_STYLES.other
                          }`}
                        >
                          {employee.role}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {employee.hourly_rate != null ? (
                        `$${employee.hourly_rate.toFixed(2)}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {employee.role === 'security'
                        ? <span className="text-muted-foreground/40">—</span>
                        : TIP_MODE_LABELS[employee.tip_mode] ?? 'Pool'}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {incomplete ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Incomplete
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-300">
                          <UserCheck className="h-3.5 w-3.5" />
                          Active
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2.5 text-xs"
                          onClick={() => setEditingEmployee(employee)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDelete(employee)}
                          disabled={deletingId === employee.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {(editingEmployee || isAddingNew) && (
        <EmployeeSetupDialog
          employee={editingEmployee ?? undefined}
          onClose={() => {
            setEditingEmployee(null);
            setIsAddingNew(false);
          }}
          onSave={(saved) => {
            if (editingEmployee) {
              setEmployees((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
            } else {
              setEmployees((prev) => [...prev, saved]);
            }
            setEditingEmployee(null);
            setIsAddingNew(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
