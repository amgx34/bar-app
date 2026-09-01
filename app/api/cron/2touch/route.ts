// Vercel Cron endpoint — checks Gmail for new 2TouchPOS report emails and
// auto-ingests them into z_report_days. This is a fallback path; the .NET SQL
// agent pushes data directly every ~5 min for bars that run it.
//
// Vercel passes the CRON_SECRET via Authorization header.
// vercel.json schedule: "0 13 * * *"    (Hobby plan — must be once per day)
//                    or "*/15 * * * *"  (Pro plan — sub-daily crons)

import { NextResponse, type NextRequest } from 'next/server';
import { poll2TouchEmails } from '@/lib/2touch/poll-emails';
import { purgeExpiredDemoUsers } from '@/lib/demo/purge';
import { createAdminClient } from '@/lib/supabase/admin';
import { runDailyNotifications } from '@/lib/notifications/run-daily';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify the request comes from Vercel Cron
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const emails = await poll2TouchEmails();

  // Housekeeping rides along on the one scheduled invocation the Hobby plan
  // allows. Both are isolated so a failure in either still lets the other run.
  const demoPurge = await purgeExpiredDemoUsers().catch((e) => {
    console.warn('[cron/2touch] demo purge failed (non-fatal):', e);
    return { usersDeleted: 0, orgsDeleted: 0, errors: [String(e)] };
  });

  const rateLimitRowsSwept = await (async () => {
    try {
      const { data, error } = await createAdminClient()
        .rpc('rate_limit_sweep', { p_older_than_hours: 24 });
      if (error) {
        console.warn('[cron/2touch] rate-limit sweep failed:', error.message);
        return 0;
      }
      return typeof data === 'number' ? data : 0;
    } catch (e) {
      console.warn('[cron/2touch] rate-limit sweep threw:', e);
      return 0;
    }
  })();

  // Strips aged JSONB payloads. The audit *rows* are retained ~7 years; only
  // the stored before/after blobs are cleared, so the record that a bank change
  // happened survives while the payload stops growing forever.
  const jsonbPruned = await (async () => {
    try {
      const { data, error } = await createAdminClient().rpc('prune_jsonb_payloads', {});
      if (error) {
        console.warn('[cron/2touch] jsonb prune failed:', error.message);
        return null;
      }
      return Array.isArray(data) ? data[0] : data;
    } catch (e) {
      console.warn('[cron/2touch] jsonb prune threw:', e);
      return null;
    }
  })();

  // Runs last, deliberately: it reads z_report_days and inventory_items, so it
  // wants the email ingest above to have landed last night's Z report first.
  const notifications = await (async () => {
    try {
      return await runDailyNotifications();
    } catch (e) {
      console.warn('[cron/2touch] notification pass threw:', e);
      return { orgsScanned: 0, notified: 0, errors: [String(e)] };
    }
  })();

  const result = { emails, demoPurge, rateLimitRowsSwept, jsonbPruned, notifications };
  console.log('[cron/2touch]', result);
  return NextResponse.json(result);
}
