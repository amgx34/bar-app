import Groq from 'groq-sdk';
import { GROQ_PARSER_MODEL } from './model';

const client = new Groq();

export interface AIParsedInventoryItem {
  name: string;
  quantity: number;
  unit: string;
  cost_price: number | null;
  category: string | null;
  sku: string | null;
}

const SYSTEM_PROMPT = `You are an inventory data extraction assistant for a bar or restaurant. Extract inventory items from any format: supplier invoices, order confirmation emails, delivery receipts, CSV/TSV data, spreadsheet pastes, or plain text lists.

Return ONLY a valid JSON object with a single key "items" containing an array. No explanation, no markdown, no code fences.

Each item must have exactly these fields:
{
  "name": string,            // product name, cleaned up (e.g. "Tito's Handmade Vodka 750ml")
  "quantity": number,        // quantity received or counted — default 1 if unclear
  "unit": string,            // unit of measure — prefer "bottle", "can", "keg", "oz", "liter", "case", "each"
  "cost_price": number|null, // per-unit cost in USD, null if not present
  "category": string|null,   // inferred category: "Spirits", "Beer", "Wine", "Mixers", "Supplies", "Garnishes", etc.
  "sku": string|null         // product SKU/UPC/item code if present, null otherwise
}

Rules:
- One entry per distinct product line
- Clean product names: fix capitalization, remove trailing punctuation
- cost_price is per-unit — divide total line cost by quantity if needed
- For alcohol: infer category from type (vodka/gin/rum/whiskey/tequila → Spirits, IPA/lager/stout → Beer, chardonnay/cabernet/rosé → Wine)
- If input is CSV or TSV, parse column headers intelligently (flexible name matching)
- Skip totals rows, tax lines, shipping charges, and non-product rows
- If quantity is a range or unclear, use the most reasonable single number
- Return {"items":[]} if no products can be identified

Example output:
{"items":[{"name":"Tito's Handmade Vodka 750ml","quantity":24,"unit":"bottle","cost_price":22.50,"category":"Spirits","sku":"TV-750"},{"name":"Modelo Especial","quantity":2,"unit":"case","cost_price":28.00,"category":"Beer","sku":null}]}`;

export async function parseInventoryWithAI(text: string): Promise<AIParsedInventoryItem[]> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set. Get a free key at console.groq.com and add it to .env.local.');
  }

  const completion = await client.chat.completions.create({
    model: GROQ_PARSER_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Extract all inventory items from this data:\n\n${text.slice(0, 12000)}` },
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

  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.items)
    ? (parsed as Record<string, unknown>).items as unknown[]
    : null;

  if (!rows) throw new Error('AI response did not contain an items array');

  const items: AIParsedInventoryItem[] = [];
  for (const item of rows) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;

    const name = String(row.name ?? '').trim();
    if (!name) continue;

    items.push({
      name,
      quantity: Math.max(0, Number(row.quantity ?? 1) || 1),
      unit: String(row.unit ?? 'each').trim() || 'each',
      cost_price: row.cost_price != null && !isNaN(Number(row.cost_price)) ? Number(row.cost_price) : null,
      category: typeof row.category === 'string' && row.category.trim() ? row.category.trim() : null,
      sku: typeof row.sku === 'string' && row.sku.trim() ? row.sku.trim() : null,
    });
  }

  return items;
}
