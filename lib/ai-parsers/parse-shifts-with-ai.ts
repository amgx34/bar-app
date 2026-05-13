'use server';

import Groq from 'groq-sdk';
import type { ParsedEmployeeShift } from '@/lib/csv-parsers/parse-employee-shifts';

const client = new Groq();

const EXCLUDED_NAMES = new Set(['front door']);

const SYSTEM_PROMPT = `You are a payroll data extraction assistant. Extract employee shift data from POS (Point of Sale) system exports.

Return ONLY a valid JSON object with a single key "shifts" containing an array of shift objects. No explanation, no markdown.

Each shift object must have exactly these fields:
{
  "employeeName": string,   // full name, title-cased (e.g. "Wes Berns")
  "shiftDate": string,      // YYYY-MM-DD format only
  "regularHours": number,   // decimal hours (e.g. 5.68)
  "overtimeHours": number   // decimal hours, 0 if not specified
}

Rules:
- SKIP any employee named "Front Door" or similar cash-register entries
- SKIP shifts where regularHours AND overtimeHours are both 0
- If an employee has multiple shifts on the same date, return them as SEPARATE entries
- Convert all dates to YYYY-MM-DD format
- If hours are shown as HH:MM, convert to decimal (5:41 → 5.68, 2:27 → 2.45)
- If only total hours are shown, put total in regularHours and 0 in overtimeHours
- Title-case all employee names

Example output:
{"shifts":[{"employeeName":"Wes Berns","shiftDate":"2026-04-17","regularHours":5.68,"overtimeHours":0}]}`;

/**
 * Uses Groq (free tier, Llama 3) to parse arbitrary POS employee shift exports.
 * Falls back to this when the known text/CSV parsers don't recognise the file format.
 */
export async function parseShiftsWithAI(
  content: string
): Promise<ParsedEmployeeShift[]> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      'GROQ_API_KEY is not set. Get a free key at console.groq.com and add it to .env.local.'
    );
  }

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Extract all employee shifts from this POS export:\n\n${content}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const raw = completion.choices[0]?.message?.content ?? '';

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`AI returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  const rows =
    Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Record<string, unknown>)?.shifts)
      ? (parsed as Record<string, unknown>).shifts as unknown[]
      : null;

  if (!rows) {
    throw new Error('AI response did not contain a shifts array');
  }

  const shifts: ParsedEmployeeShift[] = [];
  for (const item of rows) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;

    const name = String(row.employeeName ?? '').trim();
    if (!name || EXCLUDED_NAMES.has(name.toLowerCase())) continue;

    const date = String(row.shiftDate ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const regular = Number(row.regularHours ?? 0);
    const overtime = Number(row.overtimeHours ?? 0);
    if (isNaN(regular) || isNaN(overtime)) continue;
    if (regular <= 0 && overtime <= 0) continue;

    shifts.push({ employeeName: name, shiftDate: date, regularHours: regular, overtimeHours: overtime });
  }

  return shifts;
}
