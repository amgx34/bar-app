import { ParsedEmployeeShift } from './parse-employee-shifts';

/**
 * Parses the plain-text Employee Worked Report exported by Scotty's On Vine POS.
 *
 * Format per employee:
 *   EMPLOYEE SELECTED:
 *   [Name]
 *
 *   DATE       TIME IN   TIME OUT   HH:MM
 *   ---------- --------- --------- ------
 *   MM/DD/YYYY HH:MM     HH:MM      H.HH
 *   ...
 *     For [Role]                   ------
 *     Grand Total Time (HH:MM)     HH.HH
 *
 * Returns ParsedEmployeeShift[] so saveEmployeeShifts can be reused unchanged.
 * Multiple shifts on the same day for the same employee are returned as separate
 * rows — saveEmployeeShifts already merges them by summing hours.
 */
export function parseEmployeeWorkReport(content: string): ParsedEmployeeShift[] {
  const EXCLUDED = new Set(['front door']);
  const results: ParsedEmployeeShift[] = [];

  // Split on the "EMPLOYEE SELECTED:" marker
  const sections = content.split(/EMPLOYEE SELECTED:/i);

  for (const section of sections.slice(1)) {
    const lines = section.split('\n');

    // First non-empty line after the marker is the employee name
    const nameLine = lines.find((l) => l.trim().length > 0);
    if (!nameLine) continue;
    const employeeName = nameLine.trim();
    if (EXCLUDED.has(employeeName.toLowerCase())) continue;

    for (const line of lines) {
      // Shift rows start with MM/DD/YYYY followed by time-in, time-out, decimal hours.
      // The trailing " *" (modified marker) is ignored.
      const match = line.match(
        /^\s*(\d{2}\/\d{2}\/\d{4})\s+\d{1,2}:\d{2}\s+\d{1,2}:\d{2}\s+([\d.]+)/
      );
      if (!match) continue;

      const [, dateStr, hoursStr] = match;
      const hours = parseFloat(hoursStr);
      if (hours <= 0) continue; // skip zero-hour clock-in/out artifacts

      // MM/DD/YYYY → YYYY-MM-DD
      const [m, d, y] = dateStr.split('/');
      const shiftDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

      results.push({
        employeeName,
        shiftDate,
        regularHours: hours,
        overtimeHours: 0,
      });
    }
  }

  return results;
}

/** Returns true if the content looks like a text Employee Worked Report. */
export function isEmployeeWorkReport(content: string): boolean {
  return /EMPLOYEE SELECTED:/i.test(content);
}
