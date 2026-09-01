import Groq from 'groq-sdk';
import type { AIParsedInventoryItem } from './parse-inventory-with-ai';
import { boundModelInput, callModel, enforceAiQuota, wrapUntrustedContent } from './guardrails';
import { GROQ_PARSER_MODEL } from './model';

const client = new Groq();

/**
 * A supplier invoice, read off pasted text.
 *
 * Separate from parseInventoryWithAI because that prompt is told to SKIP totals,
 * tax and shipping rows — the exact lines a shipment has to capture. Teaching
 * one prompt both jobs would make it worse at each.
 *
 * Every field here is a SUGGESTION. Nothing reaches the database without
 * passing through the review step, and pasted text is attacker-controlled — see
 * guardrails.ts — so the server action validates all of it again with zod.
 * Reuses shared injection defenses: quota enforcement, input bounding, and
 * untrusted content wrapping.
 */
export interface AIParsedShipment {
  vendor_name: string | null;
  invoice_number: string | null;
  /** YYYY-MM-DD. Null when the invoice does not say or the date is unreadable. */
  invoice_date: string | null;
  freight: number | null;
  tax: number | null;
  deposits: number | null;
  other_charges: number | null;
  invoice_total: number | null;
  items: AIParsedInventoryItem[];
}

const SYSTEM_PROMPT = `You are reading a supplier invoice or delivery receipt for a bar or restaurant.

Return ONLY a valid JSON object. No explanation, no markdown, no code fences.

{
  "vendor_name": string|null,     // the supplier/distributor, e.g. "Southern Glazer's"
  "invoice_number": string|null,  // invoice or document number
  "invoice_date": string|null,    // YYYY-MM-DD
  "freight": number|null,         // delivery/fuel/shipping charge in USD
  "tax": number|null,             // sales tax in USD
  "deposits": number|null,        // bottle/keg deposits in USD
  "other_charges": number|null,   // any other invoice-level charge in USD
  "invoice_total": number|null,   // the grand total printed on the invoice
  "items": [
    {
      "name": string,            // product name, cleaned up
      "quantity": number,        // units received — default 1 if unclear
      "unit": string,            // "bottle", "can", "keg", "case", "each", ...
      "cost_price": number|null, // per-unit cost in USD
      "category": string|null,   // "Spirits", "Beer", "Wine", "Mixers", "Supplies", ...
      "sku": string|null
    }
  ]
}

Rules:
- One entry in "items" per product line ONLY. Freight, tax, deposits and totals
  are invoice-level fields above, never items.
- cost_price is PER UNIT — divide the line total by the quantity if the invoice
  shows only a line total.
- Never invent a value. If the invoice does not show it, use null.
- invoice_total is what is printed, even if it does not match the lines. Do not
  compute it yourself — a mismatch is something the operator needs to see.
- For alcohol infer category from type (vodka/gin/rum/whiskey/tequila -> Spirits,
  IPA/lager/stout -> Beer, chardonnay/cabernet/rose -> Wine). Napkins, straws,
  cups, cleaning chemicals -> Supplies.
- Return "items": [] if no product lines can be identified.`;

/** Reads a number the model may have returned as a string, or not at all. */
function num(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Accepts only a real YYYY-MM-DD. A malformed date must not reach a DATE column. */
function isoDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    ? raw
    : null;
}

function str(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

export async function parseShipmentWithAI(text: string): Promise<AIParsedShipment> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set. Get a free key at console.groq.com and add it to .env.local.');
  }

  // Bound the spend before the call, and the payload before it is sent.
  await enforceAiQuota();
  const bounded = boundModelInput(text);

  const completion = await callModel(() => client.chat.completions.create({
    model: GROQ_PARSER_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: wrapUntrustedContent(
          bounded,
          'Read the supplier invoice below.',
        ),
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  }));

  const raw = completion.choices[0]?.message?.content ?? '';

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Model output is untrusted too — never echo it into an error surfaced to
    // the user, since a crafted file can choose what it says.
    throw new Error('Could not read that invoice — check the text you pasted, or enter it by hand.');
  }

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];

  return {
    vendor_name: str(parsed.vendor_name),
    invoice_number: str(parsed.invoice_number),
    invoice_date: isoDate(parsed.invoice_date),
    freight: num(parsed.freight),
    tax: num(parsed.tax),
    deposits: num(parsed.deposits),
    other_charges: num(parsed.other_charges),
    invoice_total: num(parsed.invoice_total),
    items: rawItems.map((row) => {
      const r = row as Record<string, unknown>;
      const quantity = Number(r.quantity);
      return {
        name: String(r.name ?? '').trim(),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit: str(r.unit) ?? 'each',
        cost_price: num(r.cost_price),
        category: str(r.category),
        sku: str(r.sku),
      };
    }).filter((item) => item.name !== ''),
  };
}
