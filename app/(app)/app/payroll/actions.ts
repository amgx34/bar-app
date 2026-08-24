'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import {
  classifyTipRole,
  tipExclusionReason,
  barbackFractionFromSettings,
  barbackSplitFromSettings,
  splitBarbackTips,
  normalizePayType,
  type BarbackPayType,
  type BarbackSplitMethod,
  type TipRole,
} from '@/lib/payroll/tip-pool';
import {
  applyTipTransfers,
  applyTipRemovals,
  applyEmployeeRemovals,
  openerBonus,
  openerBonusFromSettings,
  type OpenerBonusConfig,
  type TipTransfer,
  type TipRemoval,
} from '@/lib/payroll/adjustments';
import { overtimeFromSettings, overtimePay } from '@/lib/payroll/overtime';
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
  /** 'hourly' means paid a wage instead of a tip cut. Barbacks only, in practice. */
  pay_type?: BarbackPayType | null;
}

export interface SaveEmployeePayload {
  id?: string;
  name: string;
  role: string;
  hourly_rate: number;
  tip_mode: TipMode;
  pay_type?: BarbackPayType;
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
        // Normalised rather than trusted: the column is NOT NULL, and an
        // undefined here would blank a deliberate 'hourly' arrangement.
        pay_type: normalizePayType(payload.pay_type),
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
        pay_type: normalizePayType(payload.pay_type),
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
  /** Tips earned per hour worked over the period. 0 when no hours are recorded. */
  tipsPerHour: number;
  /** Base rate plus tips per hour — what the time was actually worth. */
  effectiveHourlyRate: number;
  totalCompensation: number;
  /**
   * Which arrangement paid this person beyond their wage. 'hourly' means they
   * drew nothing from the tip pool. Shown in payroll so a zero tip figure reads
   * as a deliberate arrangement rather than a missing split.
   */
  payType: BarbackPayType;
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
  const barbackFrac = barbackFractionFromSettings(org.bar_settings ?? {});
  const barbackSplitMethod = barbackSplitFromSettings(org.bar_settings ?? {});

  // Configurable since the app was built, but never applied to anything until
  // now — see lib/payroll/adjustments.ts for how each type is funded.
  const openerCfg = openerBonusFromSettings(org.bar_settings ?? {});
  // Defaults to 1.5x enabled, which is what every pay run did before the
  // setting existed — see lib/payroll/overtime.ts.
  const overtimeCfg = overtimeFromSettings(org.bar_settings ?? {});

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
    // Opener bonus paid as hours rather than tips. Kept separate from the tip
    // map because it is the bar's money, not the pool's, and must not be
    // reported as tips on a pay stub.
    const openerBonusHours = new Map<string, number>();

    // Manual reallocations for this period, applied after the split.
    const { data: adjustmentRows } = await supabase
      .from('payroll_adjustments')
      .select('employee_id, counterparty_employee_id, amount')
      .eq('organization_id', org.id)
      .eq('kind', 'tip_transfer')
      .gte('shift_date', startDate)
      .lte('shift_date', endDate)
      // Chronological, and NOT optional. Transfers are capped at what the
      // sender holds at that moment, so the order they are applied in changes
      // the result. Without an ORDER BY, Postgres returns them in whatever
      // order it likes and the same pay period could total differently between
      // two runs. Oldest first, because each transfer was entered against the
      // balance as it stood then.
      .order('created_at', { ascending: true });

    const tipTransfers: TipTransfer[] = (adjustmentRows ?? []).map((r) => ({
      fromEmployeeId: r.employee_id as string,
      toEmployeeId: r.counterparty_employee_id as string,
      amount: Number(r.amount) || 0,
    }));

    // Tips taken out of the pool — a legally required cash payout, say. Fetched
    // per night because they come off the top before that night is split.
    const { data: removalRows } = await supabase
      .from('payroll_adjustments')
      .select('shift_date, employee_id, amount, reason')
      .eq('organization_id', org.id)
      .eq('kind', 'tip_removal')
      .gte('shift_date', startDate)
      .lte('shift_date', endDate);

    const removalsByDate = new Map<string, TipRemoval[]>();
    for (const r of removalRows ?? []) {
      const date = r.shift_date as string;
      const list = removalsByDate.get(date) ?? [];
      list.push({
        amount: Number(r.amount) || 0,
        employeeId: (r.employee_id as string | null) ?? null,
        reason: (r.reason as string) ?? '',
      });
      removalsByDate.set(date, list);
    }

    const employeeTipAmounts = new Map<string, number>(
      payrollEmployees.map((e) => [e.id, 0])
    );

    for (const report of zReports || []) {
      // Removals come off BEFORE the barback cut and the bartender split, so a
      // court-ordered payout shrinks the night for everybody proportionally
      // rather than coming out of one person's share.
      const removal = applyTipRemovals(
        (report.cash_tips || 0) + (report.cc_tips || 0),
        removalsByDate.get(report.report_date) ?? [],
      );
      const dailyTips = removal.tipsAfterRemoval;
      if (dailyTips <= 0) continue;

      const dayShifts = shiftsByDate.get(report.report_date) || [];

      // Barbacks on this day — triggered by role OR tip_mode, but not if no_tip
      const barbackShiftsToday = dayShifts.filter((s) => {
        const emp = employeeById.get(s.employee_id);
        return !!emp && classifyTipRole({ role: emp.role, tipMode: emp.tip_mode }) === 'barback';
      });

      // A barback on `pay_type = 'hourly'` is paid a wage instead of a tip cut,
      // so they hold a slot in the split but do not claim it — see
      // splitBarbackTips for why the slot is not simply removed.
      const barbackSplit = splitBarbackTips({
        dailyTips,
        barbackFraction: barbackFrac,
        method: barbackSplitMethod,
        barbackShifts: barbackShiftsToday.map((s) => ({
          employeeId: s.employee_id,
          payType: normalizePayType(employeeById.get(s.employee_id)?.pay_type),
          // Zeroed hours mean "Remove from shift" was used; that is not a slot.
          hours: (s.regular_hours || 0) + (s.overtime_hours || 0),
        })),
      });

      for (const [employeeId, amount] of barbackSplit.tipsByEmployee) {
        employeeTipAmounts.set(employeeId, (employeeTipAmounts.get(employeeId) || 0) + amount);
      }

      const poolTips = barbackSplit.poolTips;

      // Regular pool: tip_mode='pool', not barback role/mode, not security/manager, not no_tip
      const poolShiftsToday = dayShifts.filter((s) => {
        const emp = employeeById.get(s.employee_id);
        return !!emp && classifyTipRole({ role: emp.role, tipMode: emp.tip_mode }) === 'pool';
      });

      const poolHoursToday = poolShiftsToday.reduce(
        (sum, s) => sum + (s.regular_hours || 0) + (s.overtime_hours || 0),
        0
      );

      // The opener's cut comes off the pool BEFORE it is shared, so the rest
      // of the bartenders split what is left. Taking it afterwards would pay
      // the bonus out of thin air and leave the night's tips over-allocated.
      const openerShiftToday = dayShifts.find((s) => s.is_opener);
      const bonus = openerShiftToday
        ? openerBonus(openerCfg, poolTips)
        : { bonusTips: 0, bonusHours: 0, fundedFromPool: 0 };

      if (openerShiftToday && bonus.bonusTips > 0) {
        employeeTipAmounts.set(
          openerShiftToday.employee_id,
          (employeeTipAmounts.get(openerShiftToday.employee_id) || 0) + bonus.bonusTips
        );
      }
      if (openerShiftToday && bonus.bonusHours > 0) {
        openerBonusHours.set(
          openerShiftToday.employee_id,
          (openerBonusHours.get(openerShiftToday.employee_id) || 0) + bonus.bonusHours
        );
      }

      const shareablePool = Math.max(0, poolTips - bonus.fundedFromPool);

      if (poolHoursToday > 0) {
        poolShiftsToday.forEach((s) => {
          const hrs = (s.regular_hours || 0) + (s.overtime_hours || 0);
          const tip = (hrs / poolHoursToday) * shareablePool;
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

    // Manual transfers land last, on top of the finished split. They conserve
    // the total (see lib/payroll/adjustments.ts), so the night still reconciles
    // against the Z report — only the holder changes.
    const adjustedTips = applyTipTransfers(employeeTipAmounts, tipTransfers);

    // Cash-outs come off AFTER transfers. Somebody paid out "for everything they
    // had" was paid their final figure, so deducting before the transfers land
    // would measure against a number they never actually held.
    //
    // Only removals naming an employee are applied here. The unattributed ones
    // were already taken off each night's pool inside the loop above, and
    // deducting them a second time would remove the same money twice.
    const allRemovals = [...removalsByDate.values()].flat();
    const cashedOut = applyEmployeeRemovals(adjustedTips, allRemovals);
    const finalTips = cashedOut.tipsByEmployee;
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
      const otPay = overtimePay(overtimeHours, hourlyRate, overtimeCfg);

      const tipAmount = finalTips.get(employee.id) || 0;

      // Opener bonus hours are paid by the bar at the employee's own rate, on
      // top of the hours they actually worked, and never as overtime — they
      // compensate setup time, not a long shift.
      const bonusHours = openerBonusHours.get(employee.id) || 0;
      const bonusPay = bonusHours * hourlyRate;

      const totalCompensation = regularPay + otPay + bonusPay + tipAmount;

      // What the shift was actually worth per hour. Bartenders judge a night by
      // this rather than by the base rate, and it is the number that shows a
      // slow Tuesday earning less than a busy Sunday at the same wage.
      //
      // Guarded on hours: an employee with tips but no recorded shift would
      // otherwise divide by zero and surface Infinity in the table.
      const tipsPerHour = totalHours > 0 ? tipAmount / totalHours : 0;
      const effectiveHourlyRate = hourlyRate + tipsPerHour;

      payrollEntries.push({
        employeeId: employee.id,
        employeeName: employee.name,
        role: employee.role,
        totalHours,
        regularHours,
        overtimeHours,
        hourlyRate,
        regularPay,
        overtimePay: otPay,
        tipAmount,
        tipsPerHour,
        effectiveHourlyRate,
        totalCompensation,
        payType: normalizePayType(employee.pay_type),
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
  /**
   * Which pool this person draws from, decided by the same function the pay run
   * uses. Never re-derived on the client from `role` alone — that is exactly
   * how this screen came to include managers and Not Tipped staff.
   */
  tipRole: TipRole;
  /** Why they are not in the split, when they are not. Null when they are. */
  excludedReason: string | null;
  /**
   * Barbacks only in practice: 'hourly' means they are paid a wage instead of a
   * tip cut, so they show a zero share here deliberately.
   */
  payType: BarbackPayType;
}

export interface DaySplitData {
  date: string;
  /** How the barback cut is divided. Sent so this screen cannot diverge. */
  barbackSplitMethod: BarbackSplitMethod;
  totalTips: number;
  totalSales: number;
  employees: DaySplitEmployee[];
  /**
   * The bar's configured opener bonus, carried to the client so the preview
   * uses the same rule the pay run does. It used to be hardcoded at 5% here
   * and read from settings there, so the two disagreed for every bar that had
   * changed it — and silently, because both looked plausible.
   */
  openerBonus: OpenerBonusConfig;
  /**
   * The barback share of the night, as a fraction. Configurable in Settings
   * (a 0-50% slider) and read by the pay run; this screen hardcoded 0.15, so
   * any bar that moved the slider saw a preview that did not match its wages.
   */
  barbackFraction: number;
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
    // tip_mode is what decides whether somebody shares the pool at all. It was
    // not selected, so the split silently included people the pay run pays
    // nothing — managers, security, and anyone set to Not Tipped.
    .select('employee_id, regular_hours, overtime_hours, employees(id, name, role, tip_mode, pay_type)')
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
    const emp = (shift.employees as unknown as {
      id: string; name: string; role: string | null; tip_mode: string | null;
      pay_type?: string | null;
    } | null);
    if (!emp) continue;
    if (DAY_SPLIT_EXCLUDED.has(emp.name.toLowerCase().trim())) continue;

    const hours = (shift.regular_hours as number || 0) + (shift.overtime_hours as number || 0);
    if (empMap.has(emp.id)) {
      empMap.get(emp.id)!.hours += hours;
    } else {
      const participant = { role: emp.role, tipMode: emp.tip_mode };
      empMap.set(emp.id, {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        hours,
        tipRole: classifyTipRole(participant),
        excludedReason: tipExclusionReason(participant),
        payType: normalizePayType(emp.pay_type),
      });
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
    openerBonus: openerBonusFromSettings(org.bar_settings ?? {}),
    barbackFraction: barbackFractionFromSettings(org.bar_settings ?? {}),
    barbackSplitMethod: barbackSplitFromSettings(org.bar_settings ?? {}),
  };
}

