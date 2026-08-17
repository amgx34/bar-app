'use server';

import Groq from 'groq-sdk';
import type { ParsedZReportText } from '@/lib/csv-parsers/parse-z-report-text';
import {
  businessDateFromLocal,
  DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
} from '@/lib/business-date';
import { boundModelInput, callModel, enforceAiQuota, wrapUntrustedContent } from './guardrails';
import { zReportAiSchema, describeSchemaFailure } from './schemas';

const client = new Groq();

const SYSTEM_PROMPT = `You are a POS system data extraction assistant. Extract daily Z report data from any POS export format.

Return ONLY a valid JSON object with this exact structure — no explanation, no markdown:
{
  "reportDate": "YYYY-MM-DD",
  "reportTime": "HH:MM",
  "totalSales": number,
  "totalTips": number,
  "serverData": [
    { "name": "Server Name", "totalSales": number, "tipsPaidOut": number }
  ]
}

Rules:
- reportDate: the calendar date printed on the report as the run/close date. Report exactly what the document says. Do NOT reason about which trading day it belongs to — that is applied downstream.
- reportTime: the run/close time printed on the report, as 24-hour "HH:MM". Use null if the document shows no time.
- totalSales: gross sales / grand total sales for the day (number, no currency symbols)
- totalTips: total tips paid out for the day (positive number even if shown as negative in the report)
- serverData: per-server breakdown if available — extract name, their total sales, and their tips paid out
- If no per-server data exists, return an empty array for serverData
- All numbers must be plain numbers (e.g. 1099.20, not "$1,099.20")
- EXCLUDE any entries that are clearly not real employees (e.g. "Front Door", "Cash Register", register numbers)

Example output:
{
  "reportDate": "2026-04-18",
  "reportTime": "03:12",
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
  content: string,
  cutoffHour: number = DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
): Promise<ParsedZReportText> {
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
          'Extract the Z report data from the POS export below.',
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
    // Model output is untrusted too — never echo it into an error surfaced to
    // the user, since a crafted file can choose what it says.
    throw new Error('The AI returned a response that was not valid JSON. Try a supported export format.');
  }

  // The schema is what makes injection survivable: whatever the model was
  // talked into saying, anything outside these bounds is rejected rather than
  // coerced into a payroll figure.
  const result = zReportAiSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(describeSchemaFailure(result.error));
  }
  const data = result.data;

  // The model reports the printed run date/time as raw facts; the trading-day
  // rule is applied here. Keeping this out of the prompt means a crafted file
  // cannot talk the model into re-dating a night's sales, and the rule stays
  // testable without a model call.
  const reportDate = businessDateFromLocal(data.reportDate, data.reportTime, cutoffHour);

  const EXCLUDED = new Set(['front door']);
  const serverData = data.serverData.filter(
    (s) => !EXCLUDED.has(s.name.toLowerCase()),
  );

  return {
    reportDate,
    totalSales: data.totalSales,
    totalTips: data.totalTips,
    serverData,
  };
}
