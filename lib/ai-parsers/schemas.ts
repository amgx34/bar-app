import { z } from 'zod';

/**
 * Output contracts for the model-backed parsers.
 *
 * These are the real defence against prompt injection. Wrapping the input makes
 * the model *less likely* to follow embedded instructions; validating the output
 * makes it *not matter* whether it did, because anything outside these bounds is
 * rejected instead of coerced. The figures here become tip pools and payroll, so
 * a silently coerced NaN is a wrong paycheque.
 */

/** Wider than any real night, narrow enough to catch a hallucinated or injected figure. */
const MAX_MONEY = 10_000_000;

const money = z.coerce
  .number()
  .finite('must be a number')
  .min(-MAX_MONEY)
  .max(MAX_MONEY);

/** Non-negative money — sales and tips are never negative once normalised. */
const positiveMoney = money.transform(Math.abs);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'must be a real date');

/** 24-hour clock time, or absent when the document prints none. */
const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM')
  .nullish();

/**
 * A person's name as printed on the report. Capped because a model coaxed into
 * echoing the document would otherwise write an essay into a name column.
 */
const serverName = z.string().trim().min(1).max(120);

export const zReportServerSchema = z.object({
  name: serverName,
  totalSales: money,
  tipsPaidOut: positiveMoney,
});

export const zReportAiSchema = z.object({
  reportDate: isoDate,
  reportTime: clockTime,
  totalSales: money,
  totalTips: positiveMoney,
  // Bounded: a Z report lists the servers who worked a shift, not thousands.
  serverData: z.array(zReportServerSchema).max(500).default([]),
});

export type ZReportAiOutput = z.infer<typeof zReportAiSchema>;

/**
 * One shift row. Hours are capped at 24 — a shift longer than a day is a parse
 * artefact or an injected value, and it would flow straight into overtime pay.
 */
export const shiftRowSchema = z.object({
  employeeName: serverName,
  shiftDate: isoDate,
  regularHours: z.coerce.number().finite().min(0).max(24).default(0),
  overtimeHours: z.coerce.number().finite().min(0).max(24).default(0),
});

export type ShiftRow = z.infer<typeof shiftRowSchema>;

/**
 * The envelope. Rows are validated individually by the caller so one malformed
 * line does not discard an otherwise good import — but the array itself is
 * bounded here, because an unbounded one is a memory and insert-volume problem.
 */
export const shiftEnvelopeSchema = z.object({
  shifts: z.array(z.unknown()).max(5_000),
});

/**
 * Turns a Zod failure into something an operator can act on, without echoing
 * model output — which may contain injected text — back into the UI.
 */
export function describeSchemaFailure(error: z.ZodError): string {
  const first = error.issues[0];
  const path = first?.path.join('.') || 'response';
  return `The AI returned data that did not match the expected shape (${path}: ${first?.message ?? 'invalid'}). The file may not be a supported report.`;
}
