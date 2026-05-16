'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import { ParsedEmployeeShift, parseDate } from '@/lib/csv-parsers/parse-employee-shifts';
import { ParsedZReport } from '@/lib/csv-parsers/parse-z-reports';
import { ParsedZReportText } from '@/lib/csv-parsers/parse-z-report-text';

export interface SavedShiftStats {
  totalSaved: number;
  newEmployees: string[];
  errors: string[];
}

export interface SavedZReportStats {
  totalSaved: number;
  dateRange: { start: string; end: string } | null;
  errors: string[];
}

export type TipMode = 'pool' | 'individual' | 'sales_pct' | 'barback' | 'no_tip';

export interface Employee {
  id: string;
  name: string;
  role: string | null;
  hourly_rate: number | null;
  tip_mode: TipMode;
}

export interface SaveEmployeePayload {
  id?: string;
  name: string;
  role: string;
  hourly_rate: number;
  tip_mode: TipMode;
}

/**
 * Save/update employee information
 */
export async function saveEmployee(payload: SaveEmployeePayload): Promise<Employee> {
  const supabase = await createClient();
  const { org } = await getCurrentOrg();

  if (!org?.id) {
    throw new Error('Organization not found');
  }

  let data: Employee;
  let error: any;

  if (payload.id) {
    const result = await supabase
      .from('employees')
      .update({
        name: payload.name,
        role: payload.role,
        hourly_rate: payload.hourly_rate,
        tip_mode: payload.tip_mode,
      })
      .eq('id', payload.id)
      .eq('organization_id', org.id)
      .select()
      .single();
    data = result.data;
    error = result.error;
  } else {
    const result = await supabase
      .from('employees')
      .insert({
        organization_id: org.id,
        name: payload.name,
        role: payload.role,
        hourly_rate: payload.hourly_rate,
        tip_mode: payload.tip_mode,
      })
      .select()
      .single();
    data = result.data;
    error = result.error;
  }

  if (error) {
    throw new Error(`Failed to save employee: ${error.message}`);
  }

  revalidatePath('/app/payroll');
  return data;
}

export async function deleteEmployee(employeeId: string): Promise<void> {
  const supabase = await createClient();
  const { org } = await getCurrentOrg();

  if (!org?.id) {
    throw new Error('Organization not found');
  }

  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', employeeId)
    .eq('organization_id', org.id);

  if (error) {
    throw new Error(`Failed to delete employee: ${error.message}`);
  }

  revalidatePath('/app/payroll');
}

export async function bulkSetTipMode(
  tipMode: TipMode
): Promise<{ updated: number }> {
  const supabase = await createClient();
  const { org } = await getCurrentOrg();

  if (!org?.id) throw new Error('Organization not found');

  // Security never gets tips; pool also excludes managers
  const baseQuery = supabase
    .from('employees')
    .update({ tip_mode: tipMode })
    .eq('organization_id', org.id)
    .neq('role', 'security');

  const { data, error } =
    tipMode === 'pool'
      ? await baseQuery.neq('role', 'manager').select('id')
      : await baseQuery.select('id');

  if (error) throw new Error(`Failed to update tip modes: ${error.message}`);

  revalidatePath('/app/payroll');
  return { updated: data?.length ?? 0 };
}

/**
 * Import employee shifts from parsed CSV data
 */
export async function saveEmployeeShifts(
  shifts: ParsedEmployeeShift[]
): Promise<SavedShiftStats> {
  const supabase = await createClient();
  const { org } = await getCurrentOrg();

  if (!org?.id) {
    throw new Error('Organization not found');
  }

  if (shifts.length === 0) {
    throw new Error('No shifts to import');
  }

  const errors: string[] = [];
  const newEmployees: string[] = [];

  // Names that are POS accounting entries, not real employees
  const EXCLUDED_NAMES = new Set(['front door']);

  try {
    // Strip out excluded entries before doing anything
    const filteredShifts = shifts.filter(
      (s) => !EXCLUDED_NAMES.has(s.employeeName.toLowerCase().trim())
    );

    if (filteredShifts.length === 0) {
      throw new Error('No valid employee shifts to import after filtering');
    }

    // Get unique employee names from shifts
    const employeeNames = Array.from(
      new Set(filteredShifts.map((s) => s.employeeName.toLowerCase()))
    );

    // Fetch ALL employees for this org — match case-insensitively in JS so
    // "wes berns" (from CSV) correctly maps to existing "Wes Berns" in the DB.
    const { data: existingEmployees, error: fetchError } = await supabase
      .from('employees')
      .select('id, name')
      .eq('organization_id', org.id);

    if (fetchError) {
      throw fetchError;
    }

    const existingNameMap = new Map(
      (existingEmployees || []).map((e) => [e.name.toLowerCase(), e.id])
    );

    // Create missing employees
    const missingNames = employeeNames.filter(
      (name) => !existingNameMap.has(name)
    );

    if (missingNames.length > 0) {
      const toTitleCase = (s: string) =>
        s.replace(/\b\w/g, (c) => c.toUpperCase());

      const newEmployeeRecords = missingNames.map((name) => ({
        organization_id: org.id,
        name: toTitleCase(name),
        role: null,
        hourly_rate: null,
        tip_mode: 'pool',
      }));

      const { data: createdEmployees, error: createError } = await supabase
        .from('employees')
        .insert(newEmployeeRecords)
        .select('id, name');

      if (createError) {
        throw createError;
      }

      (createdEmployees || []).forEach((emp) => {
        existingNameMap.set(emp.name.toLowerCase(), emp.id);
        newEmployees.push(emp.name);
      });
    }

    // Get the date range from filtered shifts
    const dates = filteredShifts.map((s) => new Date(s.shiftDate).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    // Clear existing shifts for this date range
    const { error: deleteError } = await supabase
      .from('employee_shifts')
      .delete()
      .eq('organization_id', org?.id)
      .gte('shift_date', minDate.toISOString().split('T')[0])
      .lte('shift_date', maxDate.toISOString().split('T')[0]);

    if (deleteError) {
      throw deleteError;
    }

    // Prepare shift records, merging duplicate (employee, date) rows by summing hours
    const mergedMap = new Map<string, {
      organization_id: string;
      employee_id: string;
      shift_date: string;
      regular_hours: number;
      overtime_hours: number;
      hourly_rate: number | null;
    }>();

    for (const shift of filteredShifts) {
      const employeeId = existingNameMap.get(shift.employeeName.toLowerCase());
      if (!employeeId) {
        errors.push(`Could not find employee ID for ${shift.employeeName}`);
        continue;
      }

      const key = `${employeeId}|${shift.shiftDate}`;
      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key)!;
        existing.regular_hours += shift.regularHours;
        existing.overtime_hours += shift.overtimeHours;
      } else {
        mergedMap.set(key, {
          organization_id: org.id,
          employee_id: employeeId,
          shift_date: shift.shiftDate,
          regular_hours: shift.regularHours,
          overtime_hours: shift.overtimeHours,
          hourly_rate: shift.hourlyRate ?? null,
        });
      }
    }

    const shiftRecords = Array.from(mergedMap.values());

    if (shiftRecords.length === 0) {
      throw new Error('No valid shifts to import after processing');
    }

    // Insert shifts
    const { error: insertError } = await supabase
      .from('employee_shifts')
      .insert(shiftRecords);

    if (insertError) {
      throw insertError;
    }

    revalidatePath('/app/payroll');

    return {
      totalSaved: shiftRecords.length,
      newEmployees,
      errors,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Import Z reports from parsed CSV data
 */
export async function saveZReports(
  reports: ParsedZReport[]
): Promise<SavedZReportStats> {
  const supabase = await createClient();
  const { org } = await getCurrentOrg();

  if (!org?.id) {
    throw new Error('Organization not found');
  }

  if (reports.length === 0) {
    throw new Error('No reports to import');
  }

  try {
    // Get the date range from reports
    const dates = reports.map((r) => new Date(r.reportDate).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    // Clear existing reports for this date range
    const { error: deleteError } = await supabase
      .from('z_report_days')
      .delete()
      .eq('organization_id', org?.id)
      .gte('report_date', minDate.toISOString().split('T')[0])
      .lte('report_date', maxDate.toISOString().split('T')[0]);

    if (deleteError) {
      throw deleteError;
    }

    // Prepare report records
    const reportRecords = reports.map((report) => ({
      organization_id: org?.id,
      report_date: report.reportDate,
      total_sales: report.totalSales,
      cash_tips: report.cashTips,
      cc_tips: report.ccTips,
    }));

    // Insert reports
    const { error: insertError } = await supabase
      .from('z_report_days')
      .insert(reportRecords);

    if (insertError) {
      throw insertError;
    }

    revalidatePath('/app/payroll');

    return {
      totalSaved: reportRecords.length,
      dateRange: {
        start: minDate.toISOString().split('T')[0],
        end: maxDate.toISOString().split('T')[0],
      },
      errors: [],
    };
  } catch (error) {
    throw error;
  }
}

export interface SavedZReportTextStats {
  reportDate: string;
  serverCount: number;
}

/**
 * Save a parsed text-format Z report.
 * Writes aggregate totals to z_report_days and per-server data to z_report_server_tips.
 */
export async function saveZReportText(
  data: ParsedZReportText
): Promise<SavedZReportTextStats> {
  const supabase = await createClient();
  const { org } = await getCurrentOrg();

  if (!org?.id) throw new Error('Organization not found');

  const { reportDate, totalSales, totalTips } = data;

  // Strip POS accounting entries — same exclusion list used across the payroll system
  const Z_EXCLUDED = new Set(['front door']);
  const serverData = data.serverData.filter(
    (s) => !Z_EXCLUDED.has(s.name.toLowerCase().trim())
  );

  // Upsert aggregate totals into z_report_days (all tips stored as cc_tips)
  const { error: dayError } = await supabase
    .from('z_report_days')
    .upsert(
      {
        organization_id: org.id,
        report_date: reportDate,
        total_sales: totalSales,
        cash_tips: 0,
        cc_tips: totalTips,
      },
      { onConflict: 'organization_id,report_date' }
    );

  if (dayError) throw new Error(`Failed to save Z report totals: ${dayError.message}`);

  let savedServerCount = 0;

  if (serverData.length > 0) {
    // Clear existing server tips for this date then re-insert.
    // If the table doesn't exist yet (migration not run), skip silently —
    // aggregate totals were already saved above so pool tips still work.
    const { error: delError } = await supabase
      .from('z_report_server_tips')
      .delete()
      .eq('organization_id', org.id)
      .eq('report_date', reportDate);

    if (delError) {
      // Table missing = migration not run yet. Return without crashing.
      if (
        delError.message.includes('schema cache') ||
        delError.message.includes('does not exist') ||
        delError.code === '42P01'
      ) {
        revalidatePath('/app/payroll');
        return { reportDate, serverCount: 0 };
      }
      throw new Error(`Failed to clear server tips: ${delError.message}`);
    }

    const { error: insertError } = await supabase
      .from('z_report_server_tips')
      .insert(
        serverData.map((s) => ({
          organization_id: org.id,
          report_date: reportDate,
          employee_name: s.name,
          total_sales: s.totalSales,
          tips_paid_out: s.tipsPaidOut,
        }))
      );

    if (insertError) throw new Error(`Failed to save server tips: ${insertError.message}`);

    savedServerCount = serverData.length;
  }

  revalidatePath('/app/payroll');
  return { reportDate, serverCount: savedServerCount };
}

export interface PayrollEntry {
  employeeId: string;
  employeeName: string;
  role: string | null;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  hourlyRate: number;
  regularPay: number;
  overtimePay: number;
  tipAmount: number;
  totalCompensation: number;
}

/**
 * Compute payroll for employees within a date range
 */
export async function computePayroll(
  startDate: string,
  endDate: string
): Promise<PayrollEntry[]> {
  const supabase = await createClient();
  const { org } = await getCurrentOrg();

  if (!org?.id) {
    throw new Error('Organization not found');
  }

  // Configurable barback cut (Settings → Tip & Pay → Barback tip %).
  // Falls back to 15 % if not set.
  const barbackPct  = Math.min(100, Math.max(0, org.bar_settings?.barback_tip_pct ?? 15));
  const barbackFrac = barbackPct / 100;
  const poolFrac    = 1 - barbackFrac;

  try {
    // Fetch all employees for the organization
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('*')
      .eq('organization_id', org?.id);

    if (empError) throw empError;

    if (!employees || employees.length === 0) {
      return [];
    }

    // Strip POS accounting entries that aren't real employees
    const PAYROLL_EXCLUDED = new Set(['front door']);
    const payrollEmployees = employees.filter(
      (e) => !PAYROLL_EXCLUDED.has(e.name.toLowerCase().trim())
    );

    // Fetch shifts within date range
    const { data: shifts, error: shiftsError } = await supabase
      .from('employee_shifts')
      .select('*')
      .eq('organization_id', org?.id)
      .gte('shift_date', startDate)
      .lte('shift_date', endDate);

    if (shiftsError) throw shiftsError;

    // Fetch Z reports within date range
    const { data: zReports, error: zError } = await supabase
      .from('z_report_days')
      .select('*')
      .eq('organization_id', org?.id)
      .gte('report_date', startDate)
      .lte('report_date', endDate);

    if (zError) throw zError;

    // Fetch per-server tips (from text Z report imports) for individual/sales_pct modes
    const { data: serverTipsRows } = await supabase
      .from('z_report_server_tips')
      .select('*')
      .eq('organization_id', org.id)
      .gte('report_date', startDate)
      .lte('report_date', endDate);

    // Group server tips by date for per-day individual/sales_pct calculations.
    // Exclude the same POS accounting entries filtered everywhere else.
    const SERVER_TIPS_EXCLUDED = new Set(['front door']);

    const serverTipsByDate = new Map<
      string,
      Array<{ name: string; totalSales: number; tipsPaidOut: number }>
    >();
    for (const row of (serverTipsRows || []).filter(
      (r) => !SERVER_TIPS_EXCLUDED.has((r.employee_name as string).toLowerCase().trim())
    )) {
      if (!serverTipsByDate.has(row.report_date)) {
        serverTipsByDate.set(row.report_date, []);
      }
      serverTipsByDate.get(row.report_date)!.push({
        name: (row.employee_name as string).toLowerCase(),
        totalSales: row.total_sales as number,
        tipsPaidOut: row.tips_paid_out as number,
      });
    }

    // Group shifts by employee id
    const shiftsByEmployee = new Map<string, any[]>();
    (shifts || []).forEach((shift) => {
      if (!shiftsByEmployee.has(shift.employee_id)) {
        shiftsByEmployee.set(shift.employee_id, []);
      }
      shiftsByEmployee.get(shift.employee_id)!.push(shift);
    });

    // Group shifts by date for per-day tip calculations
    const shiftsByDate = new Map<string, any[]>();
    (shifts || []).forEach((shift) => {
      const d: string = shift.shift_date;
      if (!shiftsByDate.has(d)) shiftsByDate.set(d, []);
      shiftsByDate.get(d)!.push(shift);
    });

    // Fast employee lookup by id (using filtered list only)
    const employeeById = new Map(payrollEmployees.map((e) => [e.id, e]));

    // ── Per-day tip distribution ─────────────────────────────────────────────
    // Barbacks: 15% of daily tips split equally by headcount on that day.
    // Regular pool (tip_mode='pool', non-barback/security/manager): 85% split
    //   by hours worked that day. When no barbacks worked, pool gets 100%.
    const employeeTipAmounts = new Map<string, number>(
      payrollEmployees.map((e) => [e.id, 0])
    );

    for (const report of zReports || []) {
      const dailyTips = (report.cash_tips || 0) + (report.cc_tips || 0);
      if (dailyTips <= 0) continue;

      const dayShifts = shiftsByDate.get(report.report_date) || [];

      // Barbacks on this day — triggered by role OR tip_mode, but not if no_tip
      const barbackShiftsToday = dayShifts.filter((s) => {
        const emp = employeeById.get(s.employee_id);
        if (!emp || emp.tip_mode === 'no_tip') return false;
        return emp.role === 'barback' || emp.tip_mode === 'barback';
      });

      let poolTips: number;

      if (barbackShiftsToday.length > 0) {
        const perBarback = (dailyTips * barbackFrac) / barbackShiftsToday.length;
        barbackShiftsToday.forEach((s) => {
          employeeTipAmounts.set(
            s.employee_id,
            (employeeTipAmounts.get(s.employee_id) || 0) + perBarback
          );
        });
        poolTips = dailyTips * poolFrac;
      } else {
        poolTips = dailyTips;
      }

      // Regular pool: tip_mode='pool', not barback role/mode, not security/manager, not no_tip
      const poolShiftsToday = dayShifts.filter((s) => {
        const emp = employeeById.get(s.employee_id);
        return (
          emp &&
          emp.tip_mode === 'pool' &&
          emp.role !== 'barback' &&
          emp.role !== 'security' &&
          emp.role !== 'manager'
        );
      });

      const poolHoursToday = poolShiftsToday.reduce(
        (sum, s) => sum + (s.regular_hours || 0) + (s.overtime_hours || 0),
        0
      );

      if (poolHoursToday > 0) {
        poolShiftsToday.forEach((s) => {
          const hrs = (s.regular_hours || 0) + (s.overtime_hours || 0);
          const tip = (hrs / poolHoursToday) * poolTips;
          employeeTipAmounts.set(
            s.employee_id,
            (employeeTipAmounts.get(s.employee_id) || 0) + tip
          );
        });
      }

      // Individual and sales_pct tips from server breakdown
      const dayServerTips = serverTipsByDate.get(report.report_date) || [];
      if (dayServerTips.length > 0) {
        const totalDaySales = dayServerTips.reduce((sum, s) => sum + s.totalSales, 0);

        for (const serverEntry of dayServerTips) {
          // Match server name to an employee (case-insensitive)
          const emp = payrollEmployees.find(
            (e) => e.name.toLowerCase() === serverEntry.name
          );
          if (!emp) continue;

          if (emp.tip_mode === 'individual') {
            employeeTipAmounts.set(
              emp.id,
              (employeeTipAmounts.get(emp.id) || 0) + serverEntry.tipsPaidOut
            );
          } else if (emp.tip_mode === 'sales_pct' && totalDaySales > 0) {
            const tipShare = (serverEntry.totalSales / totalDaySales) * dailyTips;
            employeeTipAmounts.set(
              emp.id,
              (employeeTipAmounts.get(emp.id) || 0) + tipShare
            );
          }
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // Build payroll entries
    const payrollEntries: PayrollEntry[] = [];

    for (const employee of payrollEmployees) {
      const employeeShifts = shiftsByEmployee.get(employee.id) || [];

      if (employeeShifts.length === 0) continue;

      let regularHours = 0;
      let overtimeHours = 0;

      employeeShifts.forEach((shift) => {
        regularHours += shift.regular_hours || 0;
        overtimeHours += shift.overtime_hours || 0;
      });

      const totalHours = regularHours + overtimeHours;

      const hourlyRate =
        employeeShifts[0]?.hourly_rate || employee.hourly_rate || 0;

      const regularPay = regularHours * hourlyRate;
      const overtimePay = overtimeHours * hourlyRate * 1.5;

      const tipAmount = employeeTipAmounts.get(employee.id) || 0;

      const totalCompensation = regularPay + overtimePay + tipAmount;

      payrollEntries.push({
        employeeId: employee.id,
        employeeName: employee.name,
        role: employee.role,
        totalHours,
        regularHours,
        overtimeHours,
        hourlyRate,
        regularPay,
        overtimePay,
        tipAmount,
        totalCompensation,
      });
    }

    // Sort by employee name
    payrollEntries.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    return payrollEntries;
  } catch (error) {
    throw error;
  }
}

// ── Day Split ────────────────────────────────────────────────────────────────

export interface DaySplitEmployee {
  id: string;
  name: string;
  role: string | null;
  hours: number;
}

export interface DaySplitData {
  date: string;
  totalTips: number;
  totalSales: number;
  employees: DaySplitEmployee[];
}

const DAY_SPLIT_EXCLUDED = new Set(['front door']);

/** Fetch shift + tip data for a single date for the day-split calculator. */
export async function getDaySplitData(date: string): Promise<DaySplitData | null> {
  const supabase = await createClient();
  const { org } = await getCurrentOrg();
  if (!org?.id) return null;

  // Shifts for this date joined with employee info
  const { data: shifts } = await supabase
    .from('employee_shifts')
    .select('employee_id, regular_hours, overtime_hours, employees(id, name, role)')
    .eq('organization_id', org.id)
    .eq('shift_date', date);

  // Tips + sales aggregate for this date
  const { data: day } = await supabase
    .from('z_report_days')
    .select('total_sales, cash_tips, cc_tips')
    .eq('organization_id', org.id)
    .eq('report_date', date)
    .maybeSingle();

  if (!shifts || shifts.length === 0) return null;

  // Merge multiple shifts per employee and attach employee info
  const empMap = new Map<string, DaySplitEmployee>();
  for (const shift of shifts) {
    const emp = (shift.employees as unknown as { id: string; name: string; role: string | null } | null);
    if (!emp) continue;
    if (DAY_SPLIT_EXCLUDED.has(emp.name.toLowerCase().trim())) continue;

    const hours = (shift.regular_hours as number || 0) + (shift.overtime_hours as number || 0);
    if (empMap.has(emp.id)) {
      empMap.get(emp.id)!.hours += hours;
    } else {
      empMap.set(emp.id, { id: emp.id, name: emp.name, role: emp.role, hours });
    }
  }

  const employees = Array.from(empMap.values())
    .filter((e) => e.hours > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    date,
    totalTips: ((day?.cash_tips as number) ?? 0) + ((day?.cc_tips as number) ?? 0),
    totalSales: (day?.total_sales as number) ?? 0,
    employees,
  };
}

