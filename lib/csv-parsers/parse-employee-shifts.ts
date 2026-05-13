import Papa from 'papaparse';

export interface ParsedEmployeeShift {
  employeeName: string;
  shiftDate: string; // YYYY-MM-DD
  regularHours: number;
  overtimeHours: number;
  hourlyRate?: number;
}

/**
 * Parses employee shift CSV data.
 * Expects columns: Employee Name, Date, Regular Hours, Overtime Hours, Hourly Rate (optional)
 * 
 * Supports various column name variations (case-insensitive):
 * - Employee: name, employee, employee_name, employee name
 * - Date: date, shift_date, shift date, work_date
 * - Regular Hours: regular_hours, regular hours, reg hours, hours
 * - Overtime Hours: overtime_hours, overtime hours, ot hours, ot_hours
 * - Hourly Rate: rate, hourly_rate, hourly rate, pay_rate
 */
export function parseEmployeeShifts(csvContent: string): Promise<ParsedEmployeeShift[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        if (results.errors.length > 0) {
          reject(new Error(`CSV parse error: ${results.errors[0].message}`));
          return;
        }

        const shifts: ParsedEmployeeShift[] = [];

        for (const row of results.data) {
          // Find the employee name column (case-insensitive)
          const employeeNameKey = Object.keys(row).find(
            (key) =>
              /^(name|employee|employee_name|employee\sname)$/i.test(key)
          );
          const employeeName = employeeNameKey ? row[employeeNameKey]?.trim() : '';

          if (!employeeName) continue;

          // Find the date column
          const dateKey = Object.keys(row).find(
            (key) =>
              /^(date|shift_date|shift\sdate|work_date|work\sdate)$/i.test(key)
          );
          const dateStr = dateKey ? row[dateKey]?.trim() : '';

          if (!dateStr) continue;

          const shiftDate = parseDate(dateStr);
          if (!shiftDate) continue;

          // Find regular hours column
          const regularHoursKey = Object.keys(row).find(
            (key) =>
              /^(regular_hours|regular\shours|reg\shours|regular|hours)$/i.test(
                key
              )
          );
          const regularHours = regularHoursKey
            ? parseFloat(row[regularHoursKey]) || 0
            : 0;

          // Find overtime hours column
          const overtimeHoursKey = Object.keys(row).find(
            (key) =>
              /^(overtime_hours|overtime\shours|ot\shours|ot_hours|overtime)$/i.test(
                key
              )
          );
          const overtimeHours = overtimeHoursKey
            ? parseFloat(row[overtimeHoursKey]) || 0
            : 0;

          // Find hourly rate column (optional)
          const rateKey = Object.keys(row).find(
            (key) =>
              /^(rate|hourly_rate|hourly\srate|pay_rate|pay\srate)$/i.test(key)
          );
          const hourlyRate = rateKey
            ? parseFloat(row[rateKey]) || undefined
            : undefined;

          // Skip if we have no hours
          if (regularHours === 0 && overtimeHours === 0) continue;

          shifts.push({
            employeeName,
            shiftDate,
            regularHours,
            overtimeHours,
            hourlyRate,
          });
        }

        resolve(shifts);
      },
      error: (error: any) => {
        reject(new Error(`CSV parsing failed: ${error.message}`));
      },
    });
  });
}

/**
 * Parse various date formats to YYYY-MM-DD string
 */
export function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;

  dateStr = dateStr.trim();

  // Try MM/DD/YYYY format first (common in US POS systems)
  const mmddyyyyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyyMatch) {
    const [, month, day, year] = mmddyyyyMatch;
    const date = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day)
    );
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  // Try YYYY-MM-DD format
  const yyyymmddMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yyyymmddMatch) {
    const [, year, month, day] = yyyymmddMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  // Try to parse as standard JS Date
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return null;
}
