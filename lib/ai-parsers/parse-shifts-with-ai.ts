'use server';

import Groq from 'groq-sdk';
import type { ParsedEmployeeShift } from '@/lib/csv-parsers/parse-employee-shifts';
import { boundModelInput, callModel, enforceAiQuota, wrapUntrustedContent } from './guardrails';
import { shiftEnvelopeSchema, shiftRowSchema, describeSchemaFailure } from './schemas';

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

  // Bound the spend before the call, and the payload before it is sent.
  await enforceAiQuota();
  const bounded = boundModelInput(content);

  const completion = await callModel(() => client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: wrapUntrustedContent(
          bounded,
          'Extract all employee shifts from the POS export below.',
        ),
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  }));

  const raw = completion.choices[0]?.message?.content ?? '';

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Never echo model output — a crafted file chooses what it would say.
    throw new Error('The AI returned a response that was not valid JSON. Try a supported export format.');
  }

  const envelope = shiftEnvelopeSchema.safeParse(
    Array.isArray(parsed) ? { shifts: parsed } : parsed,
  );
  if (!envelope.success) {
    throw new Error(describeSchemaFailure(envelope.error));
  }

  // Rows are validated one at a time so a single malformed line does not throw
  // away an otherwise good import — but every value that survives is inside the
  // schema's bounds, so nothing unbounded reaches payroll.
  const shifts: ParsedEmployeeShift[] = [];
  for (const item of envelope.data.shifts) {
    const row = shiftRowSchema.safeParse(item);
    if (!row.success) continue;

    const { employeeName, shiftDate, regularHours, overtimeHours } = row.data;
    if (EXCLUDED_NAMES.has(employeeName.toLowerCase())) continue;
    if (regularHours <= 0 && overtimeHours <= 0) continue;

    shifts.push({ employeeName, shiftDate, regularHours, overtimeHours });
  }

  return shifts;
}
