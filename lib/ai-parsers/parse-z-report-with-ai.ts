'use server';

import Groq from 'groq-sdk';
import type { ParsedZReportText } from '@/lib/csv-parsers/parse-z-report-text';

const client = new Groq();

const SYSTEM_PROMPT = `You are a POS system data extraction assistant. Extract daily Z report data from any POS export format.

Return ONLY a valid JSON object with this exact structure — no explanation, no markdown:
{
  "reportDate": "YYYY-MM-DD",
  "totalSales": number,
  "totalTips": number,
  "serverData": [
    { "name": "Server Name", "totalSales": number, "tipsPaidOut": number }
  ]
}

Rules:
- reportDate: the business date the report covers (use the end date if it spans two days, or the run date)
- totalSales: gross sales / grand total sales for the day (number, no currency symbols)
- totalTips: total tips paid out for the day (positive number even if shown as negative in the report)
- serverData: per-server breakdown if available — extract name, their total sales, and their tips paid out
- If no per-server data exists, return an empty array for serverData
- All numbers must be plain numbers (e.g. 1099.20, not "$1,099.20")
- EXCLUDE any entries that are clearly not real employees (e.g. "Front Door", "Cash Register", register numbers)

Example output:
{
  "reportDate": "2026-04-18",
  "totalSales": 8379.74,
  "totalTips": 1099.20,
  "serverData": [
    {"name":"Wes Berns","totalSales":1291.64,"tipsPaidOut":258.85},
    {"name":"Steve Miick","totalSales":3503.45,"tipsPaidOut":414.85}
  ]
}`;

/**
 * Uses Groq (free tier, Llama 3) to parse any POS Z report format.
 * Falls back to this when the dedicated text parser doesn't recognise the file.
 */
export async function parseZReportWithAI(
  content: string
): Promise<ParsedZReportText> {
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
        content: `Extract the Z report data from this POS export:\n\n${content}`,
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

  const obj = parsed as Record<string, unknown>;

  // Validate required fields
  const reportDate = String(obj.reportDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    throw new Error(`AI returned an invalid date: "${obj.reportDate}"`);
  }

  const totalSales = Number(obj.totalSales ?? 0);
  const totalTips = Math.abs(Number(obj.totalTips ?? 0));

  if (isNaN(totalSales) || isNaN(totalTips)) {
    throw new Error('AI returned non-numeric sales or tips values');
  }

  // Parse server data
  const EXCLUDED = new Set(['front door']);
  const rawServers = Array.isArray(obj.serverData) ? obj.serverData : [];
  const serverData = (rawServers as unknown[])
    .filter((s) => typeof s === 'object' && s !== null)
    .map((s) => {
      const row = s as Record<string, unknown>;
      return {
        name: String(row.name ?? '').trim(),
        totalSales: Number(row.totalSales ?? 0),
        tipsPaidOut: Math.abs(Number(row.tipsPaidOut ?? 0)),
      };
    })
    .filter(
      (s) =>
        s.name.length > 0 &&
        !EXCLUDED.has(s.name.toLowerCase()) &&
        !isNaN(s.totalSales) &&
        !isNaN(s.tipsPaidOut)
    );

  return { reportDate, totalSales, totalTips, serverData };
}
