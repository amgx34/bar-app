/**
 * IMAP poller — reads unread replies to Rail order emails from Gmail,
 * parses pricing + breakdown with Groq, and stores them as bar_messages.
 *
 * Server-only — never import this in a client component.
 */

import { ImapFlow } from 'imapflow';
import Groq from 'groq-sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { GROQ_PARSER_MODEL } from '@/lib/ai-parsers/model';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Types (canonical definition lives in app/actions/messages.ts) ────────────

type BreakdownItem = {
  item:       string;
  quantity:   string;
  unit_price: number | null;
  line_total: number | null;
};

type ParsedReply = {
  total_amount:  number | null;
  breakdown:     BreakdownItem[];
  rep_confirmed: boolean;
  notes:         string;
};

// ── Groq AI parser ────────────────────────────────────────────────────────────

async function parseWithGroq(rawBody: string, subject: string): Promise<ParsedReply> {
  // Strip quoted reply lines (starting with ">") to focus on what the rep wrote
  const body = rawBody
    .split('\n')
    .filter((l) => !l.trim().startsWith('>') && !l.trim().startsWith('On '))
    .join('\n')
    .replace(/\r/g, '')
    .trim()
    .slice(0, 2500);

  try {
    const result = await groq.chat.completions.create({
      model: GROQ_PARSER_MODEL,
      messages: [
        {
          role: 'system',
          content: `You parse supplier email replies to bar purchase orders.
Extract the following and return ONLY valid JSON (no markdown):
{
  "total_amount": number or null,
  "breakdown": [
    { "item": string, "quantity": string, "unit_price": number_or_null, "line_total": number_or_null }
  ],
  "rep_confirmed": boolean,
  "notes": string
}
rep_confirmed = true when the supplier is accepting/confirming the order.
Focus ONLY on what the supplier wrote — ignore any quoted original order text.`,
        },
        {
          role: 'user',
          content: `Subject: ${subject}\n\nSupplier reply:\n${body}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const data = JSON.parse(result.choices[0]?.message?.content ?? '{}');
    return {
      total_amount:  typeof data.total_amount === 'number' ? data.total_amount : null,
      breakdown:     Array.isArray(data.breakdown) ? data.breakdown : [],
      rep_confirmed: Boolean(data.rep_confirmed),
      notes:         String(data.notes ?? ''),
    };
  } catch {
    return { total_amount: null, breakdown: [], rep_confirmed: false, notes: '' };
  }
}

// ── PO number extraction ──────────────────────────────────────────────────────

function extractPO(subject: string): string | null {
  // Matches "PO RO-XXXXX" or "PO #RO-XXXXX" case-insensitively
  const m = subject.match(/PO\s+#?([A-Z0-9-]+)/i);
  return m?.[1]?.toUpperCase() ?? null;
}

// ── Main poll function ────────────────────────────────────────────────────────

export async function pollEmailReplies(): Promise<{ processed: number; error?: string }> {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, '');

  if (!user || !pass) return { processed: 0, error: 'Email not configured' };

  const supabase = createAdminClient();
  let processed = 0;

  const client = new ImapFlow({
    host:       'imap.gmail.com',
    port:       993,
    secure:     true,
    auth:       { user, pass },
    logger:     false,
    clientInfo: { name: 'Rail', version: '1.0' },
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const searchResult = await client.search({ seen: false, subject: 'Re: Order from' });
      const uids  = Array.isArray(searchResult) ? searchResult : [];
      const batch = uids.slice(-15); // process at most 15 per poll

      for (const uid of batch) {
        try {
          const msg = await client.fetchOne(String(uid), {
            envelope: true,
            source:   true,
          });
          if (!msg) continue;

          const subject   = msg.envelope?.subject ?? '';
          const messageId = msg.envelope?.messageId ?? `imap-${uid}`;
          const poNumber  = extractPO(subject);

          if (!poNumber) continue; // not a Rail order reply

          // Skip already-ingested messages
          const { data: dup } = await supabase
            .from('bar_messages')
            // admin-scope-ok: cron job with no user context — dedupes inbound mail by
            // gmail_message_id before the owning org is known.
            .select('id')
            .eq('gmail_message_id', messageId)
            .maybeSingle();
          if (dup) { await client.messageFlagsAdd(String(uid), ['\\Seen']); continue; }

          // Find matching order
          const { data: order } = await supabase
            .from('rep_orders')
            .select('id, organization_id, rep_id')
            .eq('po_number', poNumber)
            .maybeSingle();
          if (!order) continue;

          // Fetch rep info
          const { data: rep } = await supabase
            .from('reps')
            // admin-scope-ok: cron job. rep_id comes from the order matched just above,
            // whose organization_id is carried forward for the insert.
            .select('name, email')
            .eq('id', order.rep_id)
            .maybeSingle();

          // Extract body from raw email source
          const raw = msg.source?.toString('utf-8') ?? '';
          const bodyStart = raw.indexOf('\r\n\r\n');
          const body = bodyStart >= 0 ? raw.slice(bodyStart + 4) : raw;

          // AI parse
          const parsed = await parseWithGroq(body, subject);

          // Persist notification
          await supabase.from('bar_messages').insert({
            organization_id:  order.organization_id,
            sender_name:      rep?.name ?? 'Rep',
            sender_email:     rep?.email ?? null,
            message_type:     'order_reply',
            subject,
            body:             parsed.notes || body.replace(/\r\n/g, '\n').slice(0, 400),
            request_type:     parsed.rep_confirmed ? 'Order Confirmed' : 'Order Response',
            requested_amount: parsed.total_amount,
            ai_breakdown:     parsed.breakdown.length > 0 ? parsed.breakdown : null,
            related_order_id: order.id,
            message_status:   'pending',
            gmail_message_id: messageId,
            is_read:          false,
          });

          // Mark as seen in Gmail so we never re-process
          await client.messageFlagsAdd(String(uid), ['\\Seen']);
          processed++;
        } catch (e) {
          console.error('[pollEmailReplies] msg error:', e);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error('[pollEmailReplies] IMAP error:', error);
    return { processed, error };
  }

  return { processed };
}
