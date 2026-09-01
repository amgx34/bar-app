/**
 * 2TouchPOS email-based data ingestion.
 *
 * 2Touch has no API — it delivers end-of-night Z reports and employee reports
 * via email from its clou-d system. This module:
 *   1. Connects to the configured Gmail inbox via IMAP
 *   2. Finds unread emails that look like 2Touch reports
 *   3. Uses Groq AI to extract structured sales / tip / shift data
 *   4. Upserts into z_report_days (and optionally employee_shifts)
 *   5. Marks the email as read so it's never processed twice
 *
 * Trigger: Vercel Cron (/api/cron/2touch) every 15 minutes.
 * Manual:  POST /api/poll-2touch (requires auth session).
 */

import { ImapFlow } from 'imapflow';
import Groq from 'groq-sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { GROQ_PARSER_MODEL } from '@/lib/ai-parsers/model';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// types of reports

type ParsedReport = {
  report_type:  'z_report' | 'employee_report' | 'unknown';
  report_date:  string | null;   // YYYY-MM-DD
  total_sales:  number | null;
  cc_tips:      number | null;
  cash_tips:    number | null;
  // Employee shift rows (if this is an employee report)
  shifts?: Array<{
    employee_name: string;
    regular_hours: number;
    overtime_hours: number;
  }>;
};

type OrgRow = {
  id: string;
  pos_config: Record<string, unknown>;
};

// ── Groq AI parser ────────────────────────────────────────────────────────────

async function parseWithGroq(subject: string, body: string): Promise<ParsedReport> {
  // Strip quoted reply blocks — focus on the actual report content
  const cleaned = body
    .split('\n')
    .filter(l => !l.trim().startsWith('>'))
    .join('\n')
    .replace(/\r/g, '')
    .trim()
    .slice(0, 3500);

  try {
    const result = await groq.chat.completions.create({
      model: GROQ_PARSER_MODEL,
      messages: [
        {
          role: 'system',
          content: `You parse emails from the 2TouchPOS cloud system.
Return ONLY valid JSON — no markdown. Schema:
{
  "report_type": "z_report" | "employee_report" | "unknown",
  "report_date": "YYYY-MM-DD" or null,
  "total_sales": number or null  (net sales, NOT including tips or tax),
  "cc_tips":     number or null  (credit/debit card tips),
  "cash_tips":   number or null  (cash tips),
  "shifts": [
    { "employee_name": string, "regular_hours": number, "overtime_hours": number }
  ] or []
}
Rules:
- report_type is "z_report" if this is a daily sales/Z report
- report_type is "employee_report" if it lists employee hours/sales
- report_type is "unknown" if it's not a financial report
- Leave fields null if not found — don't guess`,
        },
        {
          role: 'user',
          content: `Subject: ${subject}\n\n${cleaned}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const raw = result.choices[0]?.message?.content ?? '{}';
    const d   = JSON.parse(raw) as ParsedReport;
    return {
      report_type:  ['z_report','employee_report'].includes(d.report_type) ? d.report_type : 'unknown',
      report_date:  typeof d.report_date === 'string' ? d.report_date : null,
      total_sales:  typeof d.total_sales === 'number' ? d.total_sales : null,
      cc_tips:      typeof d.cc_tips     === 'number' ? d.cc_tips     : null,
      cash_tips:    typeof d.cash_tips   === 'number' ? d.cash_tips   : null,
      shifts:       Array.isArray(d.shifts) ? d.shifts : [],
    };
  } catch {
    return { report_type: 'unknown', report_date: null, total_sales: null, cc_tips: null, cash_tips: null, shifts: [] };
  }
}

// ── Sender matching ───────────────────────────────────────────────────────────

function matches2Touch(from: string, subject: string, configuredSender: string | null): boolean {
  const f = from.toLowerCase();
  const s = subject.toLowerCase();

  // If the bar has explicitly configured a sender, ONLY match that sender.
  // At scale this is required — heuristics alone match too broadly across 1000 orgs.
  if (configuredSender) return f.includes(configuredSender.toLowerCase());

  // No sender configured: only match clearly 2Touch-specific patterns.
  // Deliberately exclude vague hints like "daily report" or "sales report"
  // that could match unrelated email from other services.
  const senderHints  = ['2touchpos.com', 'noreply@2touch', 'reports@2touch'];
  const subjectHints = ['2touchpos', '2touch z report', '2touch daily'];
  return (
    senderHints.some(h  => f.includes(h)) ||
    subjectHints.some(h => s.includes(h))
  );
}

// ── Main poll function ────────────────────────────────────────────────────────

export type PollResult = {
  processed:   number;
  zReports:    number;
  empReports:  number;
  errors:      string[];
};

export async function poll2TouchEmails(): Promise<PollResult> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, '');

  if (!gmailUser || !gmailPass) {
    return { processed: 0, zReports: 0, empReports: 0, errors: ['Gmail not configured'] };
  }

  const supabase    = createAdminClient();
  const result: PollResult = { processed: 0, zReports: 0, empReports: 0, errors: [] };

  // Get all orgs using 2Touch — fetched once per poll cycle, not per email.
  // With 1000 2Touch orgs this is one query returning ~1000 rows, which is fine.
  // The per-email work is O(1) map lookup, not O(n) DB scan.
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, pos_config')
    .eq('pos_provider', '2touch');

  // Build sender → orgId map for O(1) lookup per email
  const senderToOrg = new Map<string, string>(); // sender_email_lower → orgId
  const fallbackOrgs: string[] = [];             // orgs with no configured sender
  for (const o of orgs ?? []) {
    const cfg    = (o.pos_config ?? {}) as Record<string, unknown>;
    const sender = (cfg.twotouch_sender_email as string | undefined)?.toLowerCase();
    if (sender) senderToOrg.set(sender, o.id);
    else        fallbackOrgs.push(o.id);
  }

  if (!orgs?.length) return result;

  const imap = new ImapFlow({
    host:       'imap.gmail.com',
    port:       993,
    secure:     true,
    auth:       { user: gmailUser, pass: gmailPass },
    logger:     false,
    clientInfo: { name: 'Rail', version: '1.0' },
  });

  try {
    await imap.connect();
    const lock = await imap.getMailboxLock('INBOX');

    try {
      // Fetch unread emails.
      // Batch size: 200 per cron run. At 15-min intervals this handles
      // ~19,000 emails/day — sufficient for 1000 bars each sending ~15 emails/day.
      // Newest emails first (slice from the end) so today's data is never delayed
      // by a backlog of older unprocessed messages.
      const searchResult = await imap.search({ seen: false });
      const uids = (Array.isArray(searchResult) ? searchResult : []).slice(-200);

      for (const uid of uids) {
        try {
          const msg = await imap.fetchOne(String(uid), { envelope: true, source: true });
          if (!msg) continue;

          const from      = msg.envelope?.from?.[0]?.address ?? '';
          const subject   = msg.envelope?.subject ?? '';
          const messageId = msg.envelope?.messageId ?? `imap-${uid}`;

          // O(1) exact lookup by configured sender email
          const fromLower    = from.toLowerCase();
          let matchingOrgId  = senderToOrg.get(fromLower)
            ?? [...senderToOrg.entries()].find(([s]) => fromLower.includes(s))?.[1];

          // If no exact match, try heuristic against fallback orgs
          // (only when an org has no sender configured)
          if (!matchingOrgId && fallbackOrgs.length > 0 && matches2Touch(from, subject, null)) {
            // Only safe when there is exactly 1 unconfigured 2Touch org
            if (fallbackOrgs.length === 1) matchingOrgId = fallbackOrgs[0];
            // Multiple unconfigured orgs → can't safely route, skip
          }

          if (!matchingOrgId) continue;

          // Skip already-processed emails
          const { data: dup } = await supabase
            .from('bar_messages')
            // admin-scope-ok: cron job with no user context. Deduplicates inbound mail
            // by gmail_message_id across all orgs before it knows which org it is for.
            .select('id')
            .eq('gmail_message_id', messageId)
            .maybeSingle();

          if (dup) { await imap.messageFlagsAdd(String(uid), ['\\Seen']); continue; }

          // Extract body from raw source
          const raw       = msg.source?.toString('utf-8') ?? '';
          const bodyStart = raw.indexOf('\r\n\r\n');
          const body      = bodyStart >= 0 ? raw.slice(bodyStart + 4) : raw;

          // Parse with Groq
          const parsed = await parseWithGroq(subject, body);

          if (parsed.report_type === 'unknown') {
            // Not a report — mark seen, skip
            await imap.messageFlagsAdd(String(uid), ['\\Seen']);
            continue;
          }

          // ── Z Report → z_report_days ──────────────────────────────────────
          if (parsed.report_type === 'z_report' && parsed.report_date && parsed.total_sales != null) {
            // Cash tips are only written when the report actually stated them
            // AND nobody has counted the jar by hand for that night. Omitting
            // the key leaves the stored value alone on conflict, which is the
            // difference between "the email didn't say" and "it was zero".
            const { data: existing } = await supabase
              .from('z_report_days')
              .select('cash_tips_source')
              .eq('organization_id', matchingOrgId)
              .eq('report_date', parsed.report_date)
              .maybeSingle();

            const keepManual = existing?.cash_tips_source === 'manual';
            const cashTips = parsed.cash_tips == null || keepManual
              ? {}
              : {
                  cash_tips: Math.round(parsed.cash_tips * 100) / 100,
                  cash_tips_source: 'pos',
                };

            await supabase.from('z_report_days').upsert({
              organization_id: matchingOrgId,
              report_date:     parsed.report_date,
              total_sales:     Math.round((parsed.total_sales ?? 0) * 100) / 100,
              cc_tips:         Math.round((parsed.cc_tips    ?? 0) * 100) / 100,
              ...cashTips,
            }, { onConflict: 'organization_id,report_date' });
            result.zReports++;
          }

          // ── Employee report → employee_shifts ────────────────────────────
          if (parsed.report_type === 'employee_report' && parsed.report_date && parsed.shifts?.length) {
            for (const shift of parsed.shifts) {
              if (!shift.employee_name?.trim()) continue;

              // Ensure employee exists
              const { data: emp } = await supabase
                .from('employees')
                // admin-scope-ok: cron job with no user context. Deduplicates inbound mail
                // by gmail_message_id across all orgs before it knows which org it is for.
                .select('id')
                .eq('organization_id', matchingOrgId)
                .ilike('name', shift.employee_name.trim())
                .maybeSingle();

              let empId = emp?.id;
              if (!empId) {
                const { data: newEmp } = await supabase
                  .from('employees')
                  .insert({ organization_id: matchingOrgId, name: shift.employee_name.trim(), tip_mode: 'pool' })
                  .select('id').single();
                empId = newEmp?.id;
              }
              if (!empId) continue;

              await supabase.from('employee_shifts').upsert({
                organization_id: matchingOrgId,
                employee_id:     empId,
                shift_date:      parsed.report_date,
                regular_hours:   shift.regular_hours  ?? 0,
                overtime_hours:  shift.overtime_hours ?? 0,
              }, { onConflict: 'organization_id,employee_id,shift_date' });
            }
            result.empReports++;
          }

          // Record that we've ingested this email (reuse bar_messages as audit log)
          await supabase.from('bar_messages').upsert({
            organization_id:  matchingOrgId,
            sender_name:      '2TouchPOS',
            sender_email:     from,
            message_type:     'order_reply',
            subject,
            body:             body.slice(0, 300),
            request_type:     parsed.report_type,
            is_read:          true,
            gmail_message_id: messageId,
            message_status:   'approved',
          }, { onConflict: 'gmail_message_id', ignoreDuplicates: true });

          // Mark email as read so we never re-process it
          await imap.messageFlagsAdd(String(uid), ['\\Seen']);
          result.processed++;

        } catch (msgErr) {
          result.errors.push(`uid ${uid}: ${msgErr instanceof Error ? msgErr.message : String(msgErr)}`);
        }
      }
    } finally {
      lock.release();
    }

    await imap.logout();
  } catch (imapErr) {
    result.errors.push(`IMAP: ${imapErr instanceof Error ? imapErr.message : String(imapErr)}`);
  }

  return result;
}
