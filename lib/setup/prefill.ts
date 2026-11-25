import { z } from 'zod';

const money = z.number().finite().min(0).max(10_000);
const pct = z.number().finite().min(0).max(100);

// Only pay and tip defaults may ride in from the demo. Never a name, address,
// phone or any nacha_* key: this comes from user_metadata, which the user controls.
const FIELDS = {
  tip_split_percent: pct,
  barback_tip_pct: pct,
  barback_split_method: z.enum(['hours', 'equal']),
  barback_tiers_enabled: z.boolean(),
  barback_tip_tiers: z.array(z.object({ minCount: z.number().int().min(0).max(100), pct })).max(20),
  default_hourly_rate: money,
  hourly_rates: z.object({
    bartender: money.optional(), barback: money.optional(), manager: money.optional(),
    server: money.optional(), security: money.optional(), other: money.optional(),
  }).strict(),
  default_pour_oz: z.number().finite().min(0.25).max(10),
  bottle_sizes_ml: z.array(z.number().finite().min(1).max(10_000)).max(30),
  overtime_enabled: z.boolean(),
  overtime_multiplier: z.number().finite().min(1).max(5),
  opener_bonus_type: z.enum(['none', 'fixed', 'percentage', 'hours']),
  opener_bonus_value: money,
  sales_tax_rate: z.number().finite().min(0).max(30),
  pos_prices_include_tax: z.boolean(),
} as const;

export type Prefill = {
  [K in keyof typeof FIELDS]?: z.infer<(typeof FIELDS)[K]>;
};

/** Validates field by field, so one hostile value costs only itself. */
export function parsePrefill(raw: unknown): Prefill {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const r = schema.safeParse((raw as Record<string, unknown>)[key]);
    if (r.success) out[key] = r.data;
  }
  return out as Prefill;
}
