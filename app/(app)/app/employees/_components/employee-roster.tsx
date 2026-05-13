'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Users, Plus, Trash2, UserCheck, AlertTriangle,
  TrendingUp, Clock, Banknote, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import EmployeeSetupDialog from '../../payroll/_components/employee-setup-dialog';
import { deleteEmployee } from '../../payroll/actions';
import type { Employee, PayrollEntry } from '../../payroll/actions';

const ROLE_COLORS: Record<string, string> = {
  bartender: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  barback:   'bg-orange-500/15 text-orange-400 border-orange-500/30',
  server:    'bg-green-500/15 text-green-400 border-green-500/30',
  manager:   'bg-violet-500/15 text-violet-400 border-violet-500/30',
  security:  'bg-red-500/15 text-red-400 border-red-500/30',
  other:     'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

const AVATAR_COLORS: Record<string, string> = {
  bartender: 'bg-blue-500/20 text-blue-400',
  barback:   'bg-orange-500/20 text-orange-400',
  server:    'bg-green-500/20 text-green-400',
  manager:   'bg-violet-500/20 text-violet-400',
  security:  'bg-red-500/20 text-red-400',
  other:     'bg-gray-500/20 text-gray-400',
};

const TIP_MODE_LABELS: Record<string, string> = {
  pool:       'Pool',
  barback:    'Barback',
  individual: 'Individual',
  sales_pct:  'Sales %',
  no_tip:     'No Tips',
};

type SortKey = 'name' | 'totalCompensation' | 'totalHours' | 'tipAmount';

interface Props {
  employees: Employee[];
  payroll: PayrollEntry[];
}

function fmt(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function EmployeeRoster({ employees: initialEmployees, payroll }: Props) {
  const router = useRouter();
  const [employees, setEmployees] = useState(initialEmployees);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('totalCompensation');
  const [sortAsc, setSortAsc] = useState(false);

  const payrollMap = new Map(payroll.map((p) => [p.employeeId, p]));

  const totalPaidOut = payroll.reduce((s, p) => s + p.totalCompensation, 0);
  const totalHours   = payroll.reduce((s, p) => s + p.totalHours, 0);
  const totalTips    = payroll.reduce((s, p) => s + p.tipAmount, 0);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sorted = [...employees].sort((a, b) => {
    const pa = payrollMap.get(a.id);
    const pb = payrollMap.get(b.id);
    let diff = 0;
    if (sortKey === 'name')               diff = a.name.localeCompare(b.name);
    else if (sortKey === 'totalCompensation') diff = (pa?.totalCompensation ?? 0) - (pb?.totalCompensation ?? 0);
    else if (sortKey === 'totalHours')    diff = (pa?.totalHours ?? 0) - (pb?.totalHours ?? 0);
    else if (sortKey === 'tipAmount')     diff = (pa?.tipAmount ?? 0) - (pb?.tipAmount ?? 0);
    return sortAsc ? diff : -diff;
  });

  async function handleDelete(emp: Employee) {
    if (!confirm(`Remove ${emp.name}? This also deletes their shift history.`)) return;
    setDeletingId(emp.id);
    try {
      await deleteEmployee(emp.id);
      setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
      toast.success(`${emp.name} removed`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setDeletingId(null);
    }
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortAsc ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />
      : null;

  const configured   = employees.filter((e) => e.role && e.hourly_rate !== null);
  const unconfigured = employees.filter((e) => !e.role || e.hourly_rate === null);

  return (
    <div className="space-y-6">

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {employees.length} {employees.length === 1 ? 'employee' : 'employees'}
        </p>
        <Button size="sm" onClick={() => setAdding(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add Employee
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-l-4 border-l-primary bg-card px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Staff</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold tabular-nums">{employees.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {configured.length} configured
            {unconfigured.length > 0 && (
              <span className="text-amber-400"> · {unconfigured.length} need setup</span>
            )}
          </p>
        </div>

        <div className="rounded-xl border border-l-4 border-l-emerald-400 bg-card px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">All-Time Payroll</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold tabular-nums text-emerald-400">{fmt(totalPaidOut)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">wages + tips combined</p>
        </div>

        <div className="rounded-xl border border-l-4 border-l-cyan-400 bg-card px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Hours Logged</span>
            <Clock className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold tabular-nums">{totalHours.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{fmt(totalTips)} in tips distributed</p>
        </div>
      </div>

      {/* Table */}
      {employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-muted-foreground">No employees yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add staff manually or import shift data from Payroll → Import</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add First Employee
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-5 w-10" />
                <TableHead
                  className="cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort('name')}
                >
                  Name <SortIcon k="name" />
                </TableHead>
                <TableHead>Role</TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort('totalHours')}
                >
                  Hours <SortIcon k="totalHours" />
                </TableHead>
                <TableHead className="text-right">Wage Pay</TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort('tipAmount')}
                >
                  Tips <SortIcon k="tipAmount" />
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none hover:text-foreground font-semibold"
                  onClick={() => toggleSort('totalCompensation')}
                >
                  Total Earned <SortIcon k="totalCompensation" />
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((emp) => {
                const p = payrollMap.get(emp.id);
                const incomplete = !emp.role || emp.hourly_rate === null;
                const avatarColor = AVATAR_COLORS[emp.role ?? 'other'] ?? AVATAR_COLORS.other;
                const roleColor   = ROLE_COLORS[emp.role ?? 'other']   ?? ROLE_COLORS.other;
                const wagePay = p ? (p.regularPay + p.overtimePay) : 0;

                return (
                  <TableRow key={emp.id} className={incomplete ? 'bg-amber-500/5' : ''}>
                    <TableCell className="pl-5">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor}`}>
                        {initials(emp.name)}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div>
                        <p className="font-medium">{emp.name}</p>
                        {emp.tip_mode && emp.role !== 'security' && (
                          <p className="text-xs text-muted-foreground">{TIP_MODE_LABELS[emp.tip_mode] ?? emp.tip_mode}</p>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {emp.role ? (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${roleColor}`}>
                          {emp.role}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {p ? (
                        <span>{p.totalHours.toFixed(1)}<span className="text-muted-foreground text-xs ml-0.5">h</span></span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {p && wagePay > 0 ? fmt(wagePay) : <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    <TableCell className="text-right tabular-nums text-cyan-400">
                      {p && p.tipAmount > 0 ? fmt(p.tipAmount) : <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    <TableCell className="text-right">
                      {p && p.totalCompensation > 0 ? (
                        <span className="font-semibold tabular-nums text-emerald-400">{fmt(p.totalCompensation)}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">No data</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {incomplete ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" /> Incomplete
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                          <UserCheck className="h-3.5 w-3.5" /> Active
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="pr-5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={() => setEditing(emp)}>
                          Edit
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDelete(emp)}
                          disabled={deletingId === emp.id}
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

      {(editing || adding) && (
        <EmployeeSetupDialog
          employee={editing ?? undefined}
          onClose={() => { setEditing(null); setAdding(false); }}
          onSave={(saved) => {
            if (editing) setEmployees((prev) => prev.map((e) => e.id === saved.id ? saved : e));
            else setEmployees((prev) => [...prev, saved]);
            setEditing(null);
            setAdding(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
