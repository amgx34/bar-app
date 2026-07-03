// Vercel Cron endpoint — checks Gmail for new 2TouchPOS report emails and
// auto-ingests them into z_report_days. This is a fallback path; the .NET SQL
// agent pushes data directly every ~5 min for bars that run it.
//
// Vercel passes the CRON_SECRET via Authorization header.
// vercel.json schedule: "0 13 * * *"    (Hobby plan — must be once per day)
//                    or "*/15 * * * *"  (Pro plan — sub-daily crons)

import { NextResponse, type NextRequest } from 'next/server';
import { poll2TouchEmails } from '@/lib/2touch/poll-emails';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify the request comes from Vercel Cron
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await poll2TouchEmails();
  console.log('[cron/2touch]', result);
  return NextResponse.json(result);
}
